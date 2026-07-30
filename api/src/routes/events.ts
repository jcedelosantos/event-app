import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';
import { findDuplicateEventSlot } from '../lib/find-duplicate-event-slot';

export const eventsRouter = Router();
eventsRouter.use(requireAuth, requireTenant);

class LinkedEventNotFoundError extends Error {}
class EventNotFoundError extends Error {}

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
	// Solo tiene efecto en tenants CHURCH — habilita la venta manual "invitado del anfitrión" con
	// tope (ver lib/host-guest.ts). Ambos deben venir juntos o ninguno; no hay gate por tipo de
	// tenant acá, un club que los cargue simplemente no tendría dónde usarlos en la UI.
	hostName: z.string().trim().min(1).nullable().optional(),
	maxHostGuests: z.number().int().min(0).nullable().optional(),
	// Solo se usa en PUT, para vincular/desvincular este evento como "misma función, otra fecha" (ver
	// Event.duplicateGroupKey): number = vincular con ese evento, null = desvincular, undefined (no
	// mandarlo) = no tocar el vínculo actual.
	linkedEventId: z.number().int().nullable().optional(),
	// Si el portal público de este evento exige pago online antes de reservar el asiento, y con qué
	// método(s) — ver public.ts (checkout con hold) y Event.paymentMode.
	paymentMode: z.enum(['NONE', 'PAYPAL', 'LINK', 'BOTH']).optional().default('NONE'),
	// Cuántas horas antes de startTime se habilita el check-in/entrega (ver scan.ts). 0 = permite
	// escanear desde cualquier momento antes del evento (sin ventana), sin tope arbitrario hacia
	// arriba más allá de lo razonable para un solo evento.
	checkInWindowHours: z.number().int().min(0).max(72).optional().default(1),
	// Fecha/hora de publicación en el portal público (ver public.ts) — null/ausente = visible ya
	// mismo, igual que siempre. Nullable (no solo optional) para poder desprogramar un evento ya
	// programado mandando explícitamente null.
	publishAt: z.coerce.date().nullable().optional(),
	// Sala de espera virtual del picker público (ver lib/waiting-room.ts) — false por defecto, opt-in
	// por evento. batchSize null = usa el default del código.
	waitingRoomEnabled: z.boolean().optional().default(false),
	waitingRoomBatchSize: z.number().int().min(1).nullable().optional(),
});

const include = { map: { include: { areas: true } }, tickets: true, products: true };

eventsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const events = await prisma.event.findMany({ where: { tenantId }, include, orderBy: { dateOn: 'asc' } });
	res.json(events);
}));

eventsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const event = await prisma.event.findUnique({ where: { id, tenantId }, include });
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

	const tenantId = req.user!.tenantId!;
	// linkedEventId solo tiene sentido al editar un evento ya existente (ver PUT más abajo) — acá se
	// descarta si llega, no hay nada que vincular todavía.
	const { dateSale, dateOff, code, linkedEventId: _linkedEventId, ...data } = parsed.data;

	const duplicate = await findDuplicateEventSlot(tenantId, data.mapId, data.dateOn);
	if (duplicate) {
		res.status(409).json({ error: `Ya existe un evento ("${duplicate.name}") con esa misma fecha y mapa asignado.` });
		return;
	}

	const created = await prisma.event.create({
		data: {
			...data,
			code: code || '',
			dateSale: dateSale ?? data.dateOn,
			dateOff: dateOff ?? data.dateOn,
			userId: req.user!.userId,
			tenantId,
		},
	});

	// Código legible basado en el id autoincremental (único por diseño) en vez de un UUID ilegible.
	const event = await prisma.event.update({
		where: { id: created.id, tenantId },
		data: { code: code || `EVT-${String(created.id).padStart(4, '0')}` },
		include,
	});
	await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'Event', entityId: event.id, summary: `Creó el evento "${event.name}"` });
	res.status(201).json(event);
}));

eventsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = eventInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { linkedEventId, ...eventData } = parsed.data;

	const current = await prisma.event.findUnique({ where: { id, tenantId }, select: { mapId: true, dateOn: true } });
	if (!current) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const effectiveMapId = 'mapId' in eventData ? eventData.mapId : current.mapId;
	const effectiveDateOn = eventData.dateOn ?? current.dateOn;
	const duplicate = await findDuplicateEventSlot(tenantId, effectiveMapId, effectiveDateOn, id);
	if (duplicate) {
		res.status(409).json({ error: `Ya existe un evento ("${duplicate.name}") con esa misma fecha y mapa asignado.` });
		return;
	}

	try {
		const event = await prisma.$transaction(async (tx) => {
			if (linkedEventId === null) {
				await tx.event.update({ where: { id, tenantId }, data: { duplicateGroupKey: null } });
			} else if (typeof linkedEventId === 'number') {
				const target = await tx.event.findUnique({ where: { id: linkedEventId, tenantId }, select: { duplicateGroupKey: true } });
				if (!target) {
					throw new LinkedEventNotFoundError();
				}
				const current = await tx.event.findUnique({ where: { id, tenantId }, select: { duplicateGroupKey: true } });
				if (!current) {
					throw new EventNotFoundError();
				}
				// Reutiliza el grupo que ya tenga cualquiera de los dos eventos (así vincular un tercer
				// evento a un par ya vinculado los suma al mismo grupo) — si ninguno tiene uno todavía, se
				// crea uno nuevo compartido.
				const groupKey = target.duplicateGroupKey ?? current.duplicateGroupKey ?? randomUUID();
				await tx.event.updateMany({ where: { tenantId, id: { in: [id, linkedEventId] } }, data: { duplicateGroupKey: groupKey } });
			}
			return tx.event.update({ where: { id, tenantId }, data: eventData, include });
		});
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'Event', entityId: event.id, summary: `Editó el evento "${event.name}"` });
		res.json(event);
	} catch (err: any) {
		if (err instanceof LinkedEventNotFoundError) {
			res.status(400).json({ error: 'El evento a vincular no existe' });
			return;
		}
		if (err instanceof EventNotFoundError || err.code === 'P2025') {
			res.status(404).json({ error: 'Evento no encontrado' });
			return;
		}
		throw err;
	}
}));

eventsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const event = await prisma.event.findUnique({ where: { id, tenantId } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const soldTicketCount = await prisma.saleTicket.count({ where: { eventId: id, tenantId } });
	if (soldTicketCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldTicketCount} ticket(s) vendido(s) para este evento.` });
		return;
	}

	const soldProductCount = await prisma.saleProduct.count({ where: { eventId: id, tenantId } });
	if (soldProductCount > 0) {
		res.status(409).json({ error: `No se puede borrar: hay ${soldProductCount} venta(s) de producto(s) para este evento.` });
		return;
	}

	// Sin ventas asociadas: los tickets y productos de este evento no le sirven a nadie más, se
	// borran junto con el evento en vez de dejar al usuario borrarlos uno por uno primero.
	await prisma.$transaction([
		prisma.ticket.deleteMany({ where: { eventId: id, tenantId } }),
		prisma.product.deleteMany({ where: { eventId: id, tenantId } }),
		prisma.event.delete({ where: { id, tenantId } }),
	]);
	await logAudit({ tenantId, userId: req.user!.userId, action: 'DELETE', entity: 'Event', entityId: id, summary: `Borró el evento "${event.name}"` });
	res.status(204).send();
}));
