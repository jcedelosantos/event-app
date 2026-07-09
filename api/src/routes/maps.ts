import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const mapsRouter = Router();
mapsRouter.use(requireAuth);

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

const include = { areas: { include: { seats: true, tables: true } } };

mapsRouter.get('/', async (_req, res) => {
	const maps = await prisma.map.findMany({ include, orderBy: { id: 'asc' } });
	res.json(maps);
});

mapsRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const map = await prisma.map.findUnique({ where: { id }, include });
	if (!map) {
		res.status(404).json({ error: 'Mapa no encontrado' });
		return;
	}
	res.json(map);
});

mapsRouter.post('/', async (req, res) => {
	const parsed = mapInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const map = await prisma.map.create({ data: parsed.data, include });
	res.status(201).json(map);
});

mapsRouter.put('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const parsed = mapInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	try {
		const map = await prisma.map.update({ where: { id }, data: parsed.data, include });
		res.json(map);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Mapa no encontrado' });
			return;
		}
		throw err;
	}
});

mapsRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.map.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Mapa no encontrado' });
			return;
		}
		throw err;
	}
});
