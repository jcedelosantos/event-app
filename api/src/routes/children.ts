import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { toPublicUser } from '../lib/serialize';
import { resolveFamilyCodeQR } from '../lib/family-code';

export const childrenRouter = Router();
childrenRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

class InsufficientStockError extends Error {}

export const childInclude = {
	event: true,
	// toPublicUser necesita parent.type (licencia) — sin este include anidado, parent.type queda
	// undefined y toPublicChild revienta al armar la respuesta.
	parent: { include: { type: true } },
	saleProduct: { include: { product: true } },
};

// El padre viene con el hash de password adentro (include: parent: true) — se limpia igual que en
// sale-tickets.ts/sale-products.ts antes de mandarlo al frontend (también lo usa scan.ts).
export function toPublicChild(child: any) {
	const { parent, ...rest } = child;
	return { ...rest, parent: toPublicUser(parent) };
}

const childInputSchema = z.object({
	name: z.string().min(1),
	age: z.coerce.number().int().min(0).max(17).optional(),
	eventId: z.number().int(),
	parentId: z.number().int(),
	// Si el evento tiene una comida del día configurada (ver Product.isMealOfTheDay), pide una
	// unidad para este hijo — no hace falta que el frontend sepa el productId, solo la intención.
	wantsMeal: z.boolean().optional().default(false),
});

childrenRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const children = await prisma.child.findMany({
		where: eventId ? { eventId, tenantId } : { tenantId },
		include: childInclude,
		orderBy: { id: 'desc' },
	});
	res.json(children.map(toPublicChild));
}));

childrenRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = childInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const tenantId = req.user!.tenantId!;
	const { name, age, eventId, parentId, wantsMeal } = parsed.data;

	const event = await prisma.event.findUnique({ where: { id: eventId, tenantId } });
	if (!event) {
		res.status(400).json({ error: 'Evento no encontrado' });
		return;
	}

	// `User` no está en el tenant-guard (ver lib/tenant-guard.ts) — sin este chequeo, un parentId de
	// OTRO tenant se aceptaría igual y el registro quedaría vinculado a ese padre/madre ajeno.
	const parent = await prisma.user.findFirst({ where: { id: parentId, tenantId } });
	if (!parent) {
		res.status(400).json({ error: 'Padre/madre inválido' });
		return;
	}

	try {
		const child = await prisma.$transaction(async (tx) => {
			let saleProductId: number | undefined;

			if (wantsMeal) {
				const mealProduct = await tx.product.findFirst({ where: { eventId, tenantId, isMealOfTheDay: true } });
				if (!mealProduct) {
					throw new Error('NO_MEAL_CONFIGURED');
				}
				// Mismo patrón atómico chequeo-y-descuento que sale-products.ts.
				const stockUpdate = await tx.product.updateMany({
					where: { id: mealProduct.id, count: { gte: 1 }, tenantId },
					data: { count: { decrement: 1 } },
				});
				if (stockUpdate.count === 0) {
					throw new InsufficientStockError();
				}
				const saleProduct = await tx.saleProduct.create({
					data: {
						eventId,
						productId: mealProduct.id,
						quantity: 1,
						paidType: 'Incluido',
						description: `Comida del día para ${name}`,
						codeQR: randomUUID(),
						userId: req.user!.userId,
						clientId: parentId,
						tenantId,
					},
				});
				saleProductId = saleProduct.id;
			}

			const codeQR = await resolveFamilyCodeQR(tx, { parentId, eventId, tenantId });
			return tx.child.create({
				data: { name, age, eventId, parentId, tenantId, codeQR, saleProductId },
				include: childInclude,
			});
		});
		res.status(201).json(toPublicChild(child));
	} catch (err: any) {
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay stock disponible de la comida del día.' });
			return;
		}
		if (err.message === 'NO_MEAL_CONFIGURED') {
			res.status(400).json({ error: 'Este evento no tiene una comida del día configurada.' });
			return;
		}
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El padre/madre o el evento indicado no existen' });
			return;
		}
		throw err;
	}
}));

// Toggle manual de retiro — mismo patrón que /sale-tickets/:id/check-in, para cuando el staff
// necesita marcar/desmarcar sin pasar por el scanner.
childrenRouter.put('/:id/check-in', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const checkedIn = req.body?.checkedIn;
	if (typeof checkedIn !== 'boolean') {
		res.status(400).json({ error: 'checkedIn debe ser true o false' });
		return;
	}
	try {
		const child = await prisma.child.update({ where: { id, tenantId }, data: { checkedInAt: checkedIn ? new Date() : null }, include: childInclude });
		res.json(toPublicChild(child));
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Registro no encontrado' });
			return;
		}
		throw err;
	}
}));

// Toggle manual de entrega de comida — separado del retiro del niño (PUT /:id/check-in): son dos
// acciones independientes (ver scan.ts), se puede entregar la comida sin haber retirado al niño
// todavía, o al revés.
childrenRouter.put('/:id/meal-delivered', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const delivered = req.body?.delivered;
	if (typeof delivered !== 'boolean') {
		res.status(400).json({ error: 'delivered debe ser true o false' });
		return;
	}
	const child = await prisma.child.findUnique({ where: { id, tenantId } });
	if (!child) {
		res.status(404).json({ error: 'Registro no encontrado' });
		return;
	}
	if (!child.saleProductId) {
		res.status(400).json({ error: 'Este hijo no tiene comida del día asociada' });
		return;
	}
	await prisma.saleProduct.update({ where: { id: child.saleProductId, tenantId }, data: { deliveredAt: delivered ? new Date() : null } });
	const updated = await prisma.child.findUnique({ where: { id, tenantId }, include: childInclude });
	res.json(toPublicChild(updated));
}));

childrenRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	try {
		const child = await prisma.child.findUnique({ where: { id, tenantId } });
		if (!child) {
			res.status(404).json({ error: 'Registro no encontrado' });
			return;
		}
		await prisma.$transaction(async (tx) => {
			// Si tenía comida asociada, se libera el cupo del producto en vez de perderlo.
			if (child.saleProductId) {
				const saleProduct = await tx.saleProduct.delete({ where: { id: child.saleProductId, tenantId } });
				await tx.product.update({ where: { id: saleProduct.productId, tenantId }, data: { count: { increment: 1 } } });
			}
			await tx.child.delete({ where: { id, tenantId } });
		});
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Registro no encontrado' });
			return;
		}
		throw err;
	}
}));
