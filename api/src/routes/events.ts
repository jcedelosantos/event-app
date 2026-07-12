import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

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
	startTime: z
		.string()
		.regex(/^\d{2}:\d{2}$/)
		.optional(),
	active: z.boolean().optional().default(true),
	mapId: z.number().int().nullable().optional(),
});

const include = { map: { include: { areas: true } }, tickets: true, products: true };

eventsRouter.get('/', asyncHandler(async (_req, res) => {
	const events = await prisma.event.findMany({ include, orderBy: { dateOn: 'asc' } });
	res.json(events);
}));

eventsRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const event = await prisma.event.findUnique({ where: { id }, include });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	res.json(event);
}));

eventsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = eventInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { dateSale, dateOff, code, ...data } = parsed.data;
	const created = await prisma.event.create({
		data: {
			...data,
			code: code || '',
			dateSale: dateSale ?? data.dateOn,
			dateOff: dateOff ?? data.dateOn,
			userId: req.user!.userId,
		},
	});

	// Código legible basado en el id autoincremental (único por diseño) en vez de un UUID ilegible.
	const event = await prisma.event.update({
		where: { id: created.id },
		data: { code: code || `EVT-${String(created.id).padStart(4, '0')}` },
		include,
	});
	await logAudit({ userId: req.user!.userId, action: 'CREATE', entity: 'Event', entityId: event.id, summary: `Creó el evento "${event.name}"` });
	res.status(201).json(event);
}));

eventsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const parsed = eventInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const event = await prisma.event.update({ where: { id }, data: parsed.data, include });
		await logAudit({ userId: req.user!.userId, action: 'UPDATE', entity: 'Event', entityId: event.id, summary: `Editó el evento "${event.name}"` });
		res.json(event);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Evento no encontrado' });
			return;
		}
		throw err;
	}
}));

eventsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);

	const event = await prisma.event.findUnique({ where: { id } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const soldTicketCount = await prisma.saleTicket.count({ where: { eventId: id } });
	if (soldTicketCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldTicketCount} ticket(s) vendido(s) para este evento.` });
		return;
	}

	const soldProductCount = await prisma.saleProduct.count({ where: { eventId: id } });
	if (soldProductCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldProductCount} venta(s) de producto(s) para este evento.` });
		return;
	}

	// Sin ventas asociadas: los tickets y productos de este evento no le sirven a nadie más, se
	// borran junto con el evento en vez de dejar al usuario borrarlos uno por uno primero.
	await prisma.$transaction([
		prisma.ticket.deleteMany({ where: { eventId: id } }),
		prisma.product.deleteMany({ where: { eventId: id } }),
		prisma.event.delete({ where: { id } }),
	]);
	await logAudit({ userId: req.user!.userId, action: 'DELETE', entity: 'Event', entityId: id, summary: `Borró el evento "${event.name}"` });
	res.status(204).send();
}));
