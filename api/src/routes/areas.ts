import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

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

const include = { seats: true, tables: true };

areasRouter.get('/', async (req, res) => {
	const mapId = req.query.mapId ? Number(req.query.mapId) : undefined;
	const areas = await prisma.area.findMany({ where: mapId ? { mapId } : undefined, include, orderBy: { id: 'asc' } });
	res.json(areas);
});

areasRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const area = await prisma.area.findUnique({ where: { id }, include });
	if (!area) {
		res.status(404).json({ error: 'Área no encontrada' });
		return;
	}
	res.json(area);
});

areasRouter.post('/', async (req, res) => {
	const parsed = areaInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const area = await prisma.area.create({ data: parsed.data, include });
	res.status(201).json(area);
});

areasRouter.put('/:id', async (req, res) => {
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
});

areasRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.area.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Área no encontrada' });
			return;
		}
		throw err;
	}
});
