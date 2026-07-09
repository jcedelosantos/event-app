import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

const ticketInputSchema = z.object({
	name: z.string().min(1),
	code: z.string().optional().default(''),
	img: z.string().optional().default(''),
	description: z.string().optional().default(''),
	type: z.string().min(1),
	count: z.coerce.number().int(),
	active: z.boolean().optional().default(true),
	price: z.coerce.number(),
	eventId: z.number().int(),
});

ticketsRouter.get('/', async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const tickets = await prisma.ticket.findMany({ where: eventId ? { eventId } : undefined, orderBy: { id: 'asc' } });
	res.json(tickets);
});

ticketsRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const ticket = await prisma.ticket.findUnique({ where: { id } });
	if (!ticket) {
		res.status(404).json({ error: 'Ticket no encontrado' });
		return;
	}
	res.json(ticket);
});

ticketsRouter.post('/', async (req, res) => {
	const parsed = ticketInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const ticket = await prisma.ticket.create({ data: { ...parsed.data, code: parsed.data.code || randomUUID() } });
		res.status(201).json(ticket);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El evento indicado no existe' });
			return;
		}
		throw err;
	}
});

ticketsRouter.put('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const parsed = ticketInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const ticket = await prisma.ticket.update({ where: { id }, data: parsed.data });
		res.json(ticket);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Ticket no encontrado' });
			return;
		}
		throw err;
	}
});

ticketsRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.ticket.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Ticket no encontrado' });
			return;
		}
		throw err;
	}
});
