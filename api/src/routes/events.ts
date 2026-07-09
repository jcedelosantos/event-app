import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

const eventInputSchema = z.object({
	name: z.string().min(1),
	img: z.string().optional().default(''),
	code: z.string().optional().default(''),
	type: z.string().min(1),
	description: z.string().optional().default(''),
	dateSale: z.coerce.date().optional(),
	dateOn: z.coerce.date(),
	dateOff: z.coerce.date().optional(),
	active: z.boolean().optional().default(true),
	mapId: z.number().int().optional(),
});

const include = { map: { include: { areas: true } }, tickets: true, catalogs: true };

eventsRouter.get('/', async (_req, res) => {
	const events = await prisma.event.findMany({ include, orderBy: { dateOn: 'asc' } });
	res.json(events);
});

eventsRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const event = await prisma.event.findUnique({ where: { id }, include });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	res.json(event);
});

eventsRouter.post('/', async (req: AuthenticatedRequest, res) => {
	const parsed = eventInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { dateSale, dateOff, ...data } = parsed.data;
	const event = await prisma.event.create({
		data: {
			...data,
			code: data.code || randomUUID(),
			dateSale: dateSale ?? data.dateOn,
			dateOff: dateOff ?? data.dateOn,
			userId: req.user!.userId,
		},
		include,
	});
	res.status(201).json(event);
});

eventsRouter.put('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const parsed = eventInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const event = await prisma.event.update({ where: { id }, data: parsed.data, include });
		res.json(event);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Evento no encontrado' });
			return;
		}
		throw err;
	}
});

eventsRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.event.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Evento no encontrado' });
			return;
		}
		throw err;
	}
});
