import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { toPublicUser } from '../lib/serialize';
import { sendProductEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';

export const saleProductsRouter = Router();
saleProductsRouter.use(requireAuth);

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
		const saleProduct = await prisma.saleProduct.create({
			data: {
				...parsed.data,
				codeQR: randomUUID(),
				userId: req.user!.userId,
			},
			include,
		});
		res.status(201).json(toPublicSaleProduct(saleProduct));
	} catch (err: any) {
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

saleProductsRouter.delete('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.saleProduct.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Venta no encontrada' });
			return;
		}
		throw err;
	}
}));
