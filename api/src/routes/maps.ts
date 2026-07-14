import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const mapsRouter = Router();
mapsRouter.use(requireAuth, requireTenant);

const mapInputSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional().default(''),
	img: z.string().optional().default(''),
	type: z.string().optional().default(''),
	x: z.coerce.number().optional().default(0),
	y: z.coerce.number().optional().default(0),
	radio: z.coerce.number().optional().default(0),
	color: z.string().optional().default('#000000'),
	size: z.coerce.number().optional().default(12),
	backGround: z.string().optional().default('#ffffff'),
});

// tables SIN anidar sus seats devolvía table.seats undefined en el frontend (Table.seats se
// declara requerido ahí) — collapse-tables.component.ts hacía table.seats.length sobre undefined,
// tirando el nombre/badge de cada mesa hasta que algún otro cambio forzaba un nuevo render.
const include = { areas: { include: { seats: true, tables: { include: { seats: true } } } } };

mapsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const maps = await prisma.map.findMany({ where: { tenantId }, include, orderBy: { id: 'asc' } });
	res.json(maps);
}));

mapsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const map = await prisma.map.findUnique({ where: { id, tenantId }, include });
	if (!map) {
		res.status(404).json({ error: 'Mapa no encontrado' });
		return;
	}
	res.json(map);
}));

mapsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = mapInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const tenantId = req.user!.tenantId!;
	const map = await prisma.map.create({ data: { ...parsed.data, tenantId }, include });
	res.status(201).json(map);
}));

mapsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = mapInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	try {
		const map = await prisma.map.update({ where: { id, tenantId }, data: parsed.data, include });
		res.json(map);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Mapa no encontrado' });
			return;
		}
		throw err;
	}
}));

mapsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const map = await prisma.map.findUnique({ where: { id, tenantId }, include: { areas: { include: { seats: true } } } });
	if (!map) {
		res.status(404).json({ error: 'Mapa no encontrado' });
		return;
	}

	const eventCount = await prisma.event.count({ where: { mapId: id, tenantId } });
	if (eventCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${eventCount} evento(s) usando este mapa.` });
		return;
	}

	const seatIds = map.areas.flatMap((area) => area.seats.map((seat) => seat.id));
	const soldCount = seatIds.length ? await prisma.saleTicket.count({ where: { seatId: { in: seatIds }, tenantId } }) : 0;
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} ticket(s) vendido(s) para asientos de este mapa.` });
		return;
	}

	const areaIds = map.areas.map((area) => area.id);
	await prisma.$transaction([
		prisma.seat.deleteMany({ where: { areaId: { in: areaIds }, tenantId } }),
		prisma.table.deleteMany({ where: { areaId: { in: areaIds }, tenantId } }),
		prisma.area.deleteMany({ where: { mapId: id, tenantId } }),
		prisma.map.delete({ where: { id, tenantId } }),
	]);
	res.status(204).send();
}));
