import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const seatsRouter = Router();
seatsRouter.use(requireAuth, requireTenant);

const seatInputSchema = z.object({
	name: z.string().min(1),
	icon: z.string().optional().default(''),
	type: z.string().optional().default(''),
	x: z.coerce.number().optional().default(0),
	y: z.coerce.number().optional().default(0),
	radio: z.coerce.number().optional().default(0),
	color: z.string().optional().default('#000000'),
	size: z.coerce.number().optional().default(12),
	areaId: z.number().int(),
	tableId: z.number().int().nullable().optional(),
});

seatsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const areaId = req.query.areaId ? Number(req.query.areaId) : undefined;
	const seats = await prisma.seat.findMany({ where: areaId ? { areaId, tenantId } : { tenantId }, orderBy: { id: 'asc' } });
	res.json(seats);
}));

seatsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const seat = await prisma.seat.findUnique({ where: { id, tenantId } });
	if (!seat) {
		res.status(404).json({ error: 'Asiento no encontrado' });
		return;
	}
	res.json(seat);
}));

seatsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = seatInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	try {
		const seat = await prisma.seat.create({ data: { ...parsed.data, tenantId } });
		res.status(201).json(seat);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El área indicada no existe' });
			return;
		}
		throw err;
	}
}));

const bulkResizeSchema = z.object({
	ids: z.array(z.number().int()).min(1),
	size: z.coerce.number(),
});

// Registrada ANTES de PUT /:id — mismo motivo y misma optimización que tables.ts: una sola
// updateMany en vez de un PUT por asiento (con mesas de 10 sillas x 50 mesas, esto evita disparar
// 500 requests individuales de golpe).
seatsRouter.put('/bulk-resize', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = bulkResizeSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	await prisma.seat.updateMany({ where: { id: { in: parsed.data.ids }, tenantId }, data: { size: parsed.data.size } });
	const seats = await prisma.seat.findMany({ where: { id: { in: parsed.data.ids }, tenantId } });
	res.json(seats);
}));

seatsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = seatInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const seat = await prisma.seat.update({ where: { id, tenantId }, data: parsed.data });
		res.json(seat);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Asiento no encontrado' });
			return;
		}
		throw err;
	}
}));

seatsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const soldCount = await prisma.saleTicket.count({ where: { seatId: id, tenantId } });
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} ticket(s) vendido(s) para este asiento.` });
		return;
	}

	try {
		await prisma.seat.delete({ where: { id, tenantId } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Asiento no encontrado' });
			return;
		}
		throw err;
	}
}));
