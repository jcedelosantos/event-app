import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const areasRouter = Router();
areasRouter.use(requireAuth);

const areaInputSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional().default(''),
	img: z.string().optional().default(''),
	icon: z.string().optional().default(''),
	type: z.string().optional().default(''),
	x: z.coerce.number().optional().default(0),
	y: z.coerce.number().optional().default(0),
	radio: z.coerce.number().optional().default(0),
	color: z.string().optional().default('#000000'),
	size: z.coerce.number().optional().default(12),
	backGround: z.string().optional().default('#ffffff'),
	mapId: z.number().int(),
});

// Igual fix que en maps.ts: tables sin anidar seats deja table.seats undefined en el frontend,
// donde Table.seats se asume siempre presente (ej. collapse-tables.component.ts).
const include = { seats: true, tables: { include: { seats: true } } };

areasRouter.get('/', asyncHandler(async (req, res) => {
	const mapId = req.query.mapId ? Number(req.query.mapId) : undefined;
	const areas = await prisma.area.findMany({ where: mapId ? { mapId } : undefined, include, orderBy: { id: 'asc' } });
	res.json(areas);
}));

areasRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const area = await prisma.area.findUnique({ where: { id }, include });
	if (!area) {
		res.status(404).json({ error: 'Área no encontrada' });
		return;
	}
	res.json(area);
}));

areasRouter.post('/', asyncHandler(async (req, res) => {
	const parsed = areaInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const area = await prisma.area.create({ data: parsed.data, include });
	res.status(201).json(area);
}));

areasRouter.put('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = areaInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	try {
		const area = await prisma.area.update({ where: { id }, data: parsed.data, include });
		res.json(area);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Área no encontrada' });
			return;
		}
		throw err;
	}
}));

const duplicateSchema = z.object({ name: z.string().min(1) });

areasRouter.post('/:id/duplicate', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = duplicateSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const original = await prisma.area.findUnique({
		where: { id },
		include: { seats: true, tables: { include: { seats: true } } },
	});
	if (!original) {
		res.status(404).json({ error: 'Área no encontrada' });
		return;
	}

	// La disposición de mesas/asientos suele cambiar de un evento a otro — duplicar copia el punto
	// de partida (posiciones incluidas) para no rearmar todo desde cero cada vez.
	const duplicate = await prisma.$transaction(async (tx) => {
		const newArea = await tx.area.create({
			data: {
				name: parsed.data.name,
				description: original.description,
				img: original.img,
				icon: original.icon,
				type: original.type,
				x: original.x,
				y: original.y,
				radio: original.radio,
				color: original.color,
				size: original.size,
				backGround: original.backGround,
				mapId: original.mapId,
			},
		});

		for (const table of original.tables) {
			const newTable = await tx.table.create({
				data: { name: table.name, icon: table.icon, type: table.type, x: table.x, y: table.y, radio: table.radio, color: table.color, size: table.size, areaId: newArea.id },
			});
			if (table.seats.length) {
				await tx.seat.createMany({
					data: table.seats.map((seat) => ({
						name: seat.name,
						icon: seat.icon,
						type: seat.type,
						x: seat.x,
						y: seat.y,
						radio: seat.radio,
						color: seat.color,
						size: seat.size,
						areaId: newArea.id,
						tableId: newTable.id,
					})),
				});
			}
		}

		const looseSeats = original.seats.filter((seat) => !seat.tableId);
		if (looseSeats.length) {
			await tx.seat.createMany({
				data: looseSeats.map((seat) => ({
					name: seat.name,
					icon: seat.icon,
					type: seat.type,
					x: seat.x,
					y: seat.y,
					radio: seat.radio,
					color: seat.color,
					size: seat.size,
					areaId: newArea.id,
				})),
			});
		}

		return tx.area.findUnique({ where: { id: newArea.id }, include });
	});

	res.status(201).json(duplicate);
}));

areasRouter.delete('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);

	const area = await prisma.area.findUnique({ where: { id }, include: { seats: true, tables: true } });
	if (!area) {
		res.status(404).json({ error: 'Área no encontrada' });
		return;
	}

	const seatIds = area.seats.map((s) => s.id);
	const soldCount = seatIds.length ? await prisma.saleTicket.count({ where: { seatId: { in: seatIds } } }) : 0;
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} ticket(s) vendido(s) para asientos de esta área.` });
		return;
	}

	// Sin ventas asociadas: borrar el área implica borrar sus asientos y mesas también, si no
	// quedaría "atascada" detrás de la foreign key sin ninguna forma de limpiarla desde la UI.
	await prisma.$transaction([
		prisma.seat.deleteMany({ where: { areaId: id } }),
		prisma.table.deleteMany({ where: { areaId: id } }),
		prisma.area.delete({ where: { id } }),
	]);
	res.status(204).send();
}));
