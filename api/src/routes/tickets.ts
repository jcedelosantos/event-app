import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const ticketsRouter = Router();
ticketsRouter.use(requireAuth);

const ticketInputSchema = z.object({
	name: z.string().min(1),
	img: z.string().optional().default(''),
	description: z.string().optional().default(''),
	type: z.string().min(1),
	count: z.coerce.number().int(),
	active: z.boolean().optional().default(true),
	price: z.coerce.number(),
	eventId: z.number().int(),
	areaId: z.number().int().nullable().optional(),
});

// El grid de tarjetas de tickets necesita mostrar a qué evento/área pertenece cada uno (varios
// eventos pueden listarse juntos) — select mínimo, no toda la fila de Event/Area.
const include = { event: { select: { id: true, name: true } }, area: { select: { id: true, name: true } } };

ticketsRouter.get('/', asyncHandler(async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const tickets = await prisma.ticket.findMany({ where: eventId ? { eventId } : undefined, include, orderBy: { id: 'asc' } });
	res.json(tickets);
}));

ticketsRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const ticket = await prisma.ticket.findUnique({ where: { id }, include });
	if (!ticket) {
		res.status(404).json({ error: 'Ticket no encontrado' });
		return;
	}
	res.json(ticket);
}));

ticketsRouter.post('/', asyncHandler(async (req, res) => {
	const parsed = ticketInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		// El código identifica el ticket en el barcode/escaneo — se genera siempre server-side a
		// partir del id (único por diseño) para que no puedan colisionar dos tickets distintos.
		const created = await prisma.ticket.create({ data: { ...parsed.data, code: '' } });
		const ticket = await prisma.ticket.update({
			where: { id: created.id },
			data: { code: `TCK-${String(created.id).padStart(4, '0')}` },
			include,
		});
		res.status(201).json(ticket);
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El evento indicado no existe' });
			return;
		}
		throw err;
	}
}));

ticketsRouter.put('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = ticketInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const ticket = await prisma.ticket.update({ where: { id }, data: parsed.data, include });
		res.json(ticket);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Ticket no encontrado' });
			return;
		}
		throw err;
	}
}));

ticketsRouter.delete('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);

	const soldCount = await prisma.saleTicket.count({ where: { ticketId: id } });
	if (soldCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldCount} venta(s) hechas con este ticket.` });
		return;
	}

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
}));
