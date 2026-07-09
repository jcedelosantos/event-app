import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const seatsRouter = Router();
seatsRouter.use(requireAuth);

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

seatsRouter.get('/', async (req, res) => {
	const areaId = req.query.areaId ? Number(req.query.areaId) : undefined;
	const seats = await prisma.seat.findMany({ where: areaId ? { areaId } : undefined, orderBy: { id: 'asc' } });
	res.json(seats);
});

seatsRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const seat = await prisma.seat.findUnique({ where: { id } });
	if (!seat) {
		res.status(404).json({ error: 'Asiento no encontrado' });
		return;
	}
	res.json(seat);
});

seatsRouter.post('/', async (req, res) => {
	const parsed = seatInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const seat = await prisma.seat.create({ data: parsed.data });
		res.status(201).json(seat);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El área indicada no existe' });
			return;
		}
		throw err;
	}
});

seatsRouter.put('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const parsed = seatInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const seat = await prisma.seat.update({ where: { id }, data: parsed.data });
		res.json(seat);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Asiento no encontrado' });
			return;
		}
		throw err;
	}
});

seatsRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.seat.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Asiento no encontrado' });
			return;
		}
		throw err;
	}
});
