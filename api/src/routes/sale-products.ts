import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { toPublicUser } from '../lib/serialize';
import { sendProductEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const saleProductsRouter = Router();
saleProductsRouter.use(requireAuth);

class InsufficientStockError extends Error {}

const saleProductInputSchema = z.object({
	eventId: z.number().int(),
	productId: z.number().int(),
	clientId: z.number().int(),
	paidType: z.string().min(1),
	quantity: z.coerce.number().int().min(1).optional().default(1),
	description: z.string().optional().default(''),
});

export const saleProductInclude = {
	event: true,
	product: true,
	client: { include: { type: true } },
	seller: { include: { type: true } },
};
const include = saleProductInclude;

export function toPublicSaleProduct(saleProduct: any) {
	const { client, seller, ...rest } = saleProduct;
	return { ...rest, client: toPublicUser(client), seller: toPublicUser(seller) };
}

saleProductsRouter.get('/', asyncHandler(async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const saleProducts = await prisma.saleProduct.findMany({ where: eventId ? { eventId } : undefined, include, orderBy: { id: 'desc' } });
	res.json(saleProducts.map(toPublicSaleProduct));
}));

saleProductsRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const saleProduct = await prisma.saleProduct.findUnique({ where: { id }, include });
	if (!saleProduct) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}
	res.json(toPublicSaleProduct(saleProduct));
}));

saleProductsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = saleProductInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const saleProduct = await prisma.$transaction(async (tx) => {
			// updateMany con `count: { gte: quantity }` en el where hace el chequeo-y-descuento en una
			// sola operación atómica — si otra venta ya se llevó el stock entremedio, `count` da 0 y no
			// se descontó nada, así que se puede confiar en el resultado sin necesidad de locks manuales.
			const stockUpdate = await tx.product.updateMany({
				where: { id: parsed.data.productId, count: { gte: parsed.data.quantity } },
				data: { count: { decrement: parsed.data.quantity } },
			});
			if (stockUpdate.count === 0) {
				throw new InsufficientStockError();
			}
			return tx.saleProduct.create({
				data: {
					...parsed.data,
					codeQR: randomUUID(),
					userId: req.user!.userId,
				},
				include,
			});
		});
		res.status(201).json(toPublicSaleProduct(saleProduct));
	} catch (err: any) {
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay suficiente stock disponible para esta cantidad.' });
			return;
		}
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'Evento, producto o cliente inválido' });
			return;
		}
		throw err;
	}
}));

saleProductsRouter.post('/:id/resend', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const saleProduct = await prisma.saleProduct.findUnique({ where: { id }, include });
	if (!saleProduct) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}

	try {
		await sendProductEmail({
			to: saleProduct.client.email,
			clientName: saleProduct.client.name,
			event: saleProduct.event,
			saleProducts: [saleProduct],
		});
		res.json({ ok: true });
	} catch (err) {
		console.error('No se pudo reenviar el email del producto:', err);
		res.status(500).json({ error: 'No se pudo enviar el correo. Revisá la configuración de email.' });
	}
}));

saleProductsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	try {
		// Borrar una venta (ej. se cargó mal) devuelve la cantidad al stock del producto — si no se
		// restaura, cada corrección de un error de captura termina "perdiendo" unidades reales.
		const saleProduct = await prisma.$transaction(async (tx) => {
			const sale = await tx.saleProduct.delete({ where: { id }, include: { product: true } });
			await tx.product.update({ where: { id: sale.productId }, data: { count: { increment: sale.quantity } } });
			return sale;
		});
		await logAudit({
			userId: req.user!.userId,
			action: 'DELETE',
			entity: 'SaleProduct',
			entityId: id,
			summary: `Borró la venta de producto "${saleProduct.product.name}" x${saleProduct.quantity} (stock restaurado)`,
		});
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Venta no encontrada' });
			return;
		}
		throw err;
	}
}));
