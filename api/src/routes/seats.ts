import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';

export const seatsRouter = Router();
seatsRouter.use(requireAuth, requireTenant, requireActiveSubscription);

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

	// Sin este chequeo, un areaId (o tableId) de OTRO tenant pasaba el `P2003` de Prisma igual (la fila
	// existe, solo que en otro tenant) y quedaba un seat huérfano colgado del mapa de otra organización.
	const area = await prisma.area.findUnique({ where: { id: parsed.data.areaId, tenantId } });
	if (!area) {
		res.status(400).json({ error: 'El área indicada no existe' });
		return;
	}
	if (parsed.data.tableId != null) {
		const table = await prisma.table.findUnique({ where: { id: parsed.data.tableId, tenantId } });
		if (!table) {
			res.status(400).json({ error: 'La mesa indicada no existe' });
			return;
		}
	}

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

const bulkCreateSchema = z.object({
	seats: z.array(seatInputSchema).min(1).max(6000),
});

// Mismo motivo y misma solución que tables.ts POST /bulk: un solo request con TODOS los asientos
// en vez de un POST por asiento (con 20 mesas x 10 asientos, eso eran 200 requests simultáneas).
seatsRouter.post('/bulk', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = bulkCreateSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;

	// Mismo chequeo que POST / (creación individual), pero en bloque: se validan TODOS los areaId/
	// tableId distintos del lote de una sola vez en vez de un round-trip por fila.
	const areaIds = [...new Set(parsed.data.seats.map((s) => s.areaId))];
	const areaCount = await prisma.area.count({ where: { id: { in: areaIds }, tenantId } });
	if (areaCount !== areaIds.length) {
		res.status(400).json({ error: 'Alguna de las áreas indicadas no existe' });
		return;
	}
	const tableIds = [...new Set(parsed.data.seats.map((s) => s.tableId).filter((id): id is number => id != null))];
	if (tableIds.length) {
		const tableCount = await prisma.table.count({ where: { id: { in: tableIds }, tenantId } });
		if (tableCount !== tableIds.length) {
			res.status(400).json({ error: 'Alguna de las mesas indicadas no existe' });
			return;
		}
	}

	const seats = await prisma.$transaction(parsed.data.seats.map((s) => prisma.seat.create({ data: { ...s, tenantId } })));
	res.status(201).json(seats);
}));

const bulkUpdatePositionSchema = z.object({
	seats: z
		.array(
			z.object({
				id: z.number().int(),
				x: z.coerce.number(),
				y: z.coerce.number(),
				size: z.coerce.number(),
			}),
		)
		.min(1),
});

// Registrado ANTES de PUT /:id, mismo motivo que bulk-resize. Reposiciona cada asiento a mano (no
// updateMany, cada uno tiene su propio x/y/size nuevo) dentro de una sola transacción — el cliente
// ya calculó las coordenadas nuevas (ver bulk-edit-tables-modal.component.ts: reduce/agranda el
// anillo de asientos proporcional al cambio de tamaño de su mesa), acá solo se persisten y se
// valida que todos pertenezcan al tenant antes de tocar nada.
seatsRouter.put('/bulk-update-position', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = bulkUpdatePositionSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	const ids = parsed.data.seats.map((s) => s.id);
	const count = await prisma.seat.count({ where: { id: { in: ids }, tenantId } });
	if (count !== ids.length) {
		res.status(400).json({ error: 'Alguno de los asientos indicados no existe' });
		return;
	}

	const seats = await prisma.$transaction(parsed.data.seats.map((s) => prisma.seat.update({ where: { id: s.id }, data: { x: s.x, y: s.y, size: s.size } })));
	res.json(seats);
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

	// Igual que en POST /: si el body trae un areaId/tableId nuevo, tiene que ser del mismo tenant —
	// si no se manda, no se toca ninguno de los dos y no hace falta validar nada.
	if (parsed.data.areaId != null) {
		const area = await prisma.area.findUnique({ where: { id: parsed.data.areaId, tenantId } });
		if (!area) {
			res.status(400).json({ error: 'El área indicada no existe' });
			return;
		}
	}
	if (parsed.data.tableId != null) {
		const table = await prisma.table.findUnique({ where: { id: parsed.data.tableId, tenantId } });
		if (!table) {
			res.status(400).json({ error: 'La mesa indicada no existe' });
			return;
		}
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
