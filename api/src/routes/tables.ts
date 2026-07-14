import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const tablesRouter = Router();
tablesRouter.use(requireAuth, requireTenant);

const tableInputSchema = z.object({
	name: z.string().min(1),
	icon: z.string().optional().default(''),
	type: z.string().optional().default(''),
	x: z.coerce.number().optional().default(0),
	y: z.coerce.number().optional().default(0),
	radio: z.coerce.number().optional().default(0),
	color: z.string().optional().default('#000000'),
	size: z.coerce.number().optional().default(12),
	areaId: z.number().int(),
});

tablesRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const areaId = req.query.areaId ? Number(req.query.areaId) : undefined;
	const tables = await prisma.table.findMany({ where: areaId ? { areaId, tenantId } : { tenantId }, include: { seats: true }, orderBy: { id: 'asc' } });
	res.json(tables);
}));

tablesRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = tableInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	try {
		const table = await prisma.table.create({ data: { ...parsed.data, tenantId }, include: { seats: true } });
		res.status(201).json(table);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El área indicada no existe' });
			return;
		}
		throw err;
	}
}));

tablesRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = tableInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const table = await prisma.table.update({ where: { id, tenantId }, data: parsed.data, include: { seats: true } });
		res.json(table);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Mesa no encontrada' });
			return;
		}
		throw err;
	}
}));

tablesRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const table = await prisma.table.findUnique({ where: { id, tenantId }, include: { seats: true } });
	if (!table) {
		res.status(404).json({ error: 'Mesa no encontrada' });
		return;
	}

	const seatIds = table.seats.map((s) => s.id);
	const soldCount = seatIds.length ? await prisma.saleTicket.count({ where: { seatId: { in: seatIds }, tenantId } }) : 0;
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} ticket(s) vendido(s) para asientos de esta mesa.` });
		return;
	}

	// Sin ventas asociadas: los asientos de esta mesa no le sirven a nadie más, se borran junto
	// con la mesa en vez de dejar al usuario borrarlos uno por uno primero.
	await prisma.$transaction([prisma.seat.deleteMany({ where: { tableId: id, tenantId } }), prisma.table.delete({ where: { id, tenantId } })]);
	res.status(204).send();
}));
