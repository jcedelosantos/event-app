import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';
import { findDuplicateEventSlot } from '../lib/find-duplicate-event-slot';
import { getWaitingRoomStats } from '../lib/waiting-room';
import { getTenantPlanFeatures, requireActiveSubscription } from '../middleware/plan';
import { isEventPlanCode } from '../lib/event-plans';

export const eventsRouter = Router();
eventsRouter.use(requireAuth, requireTenant, requireActiveSubscription);

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
	// Cupo total del evento, compartido entre todos los tipos de ticket (ver lib/capacity.ts). null =
	// sin tope, aplica a cualquier tenant.
	maxCapacity: z.number().int().min(1).nullable().optional(),
	// Solo tiene efecto en tenants CLUB — cuántos invitados puede traer un socio a este evento. null =
	// usa el default del código (MAX_INVITADOS_PER_SOCIO, ver lib/attendee.ts).
	maxGuestsPerSponsor: z.number().int().min(0).nullable().optional(),
});

const include = { map: { include: { areas: true } }, tickets: true, products: true };

// A diferencia de requirePlan (gatea una ruta entera), acá el plan solo importa si el payload
// puntual prende una feature premium — un tenant Básico sigue pudiendo crear/editar eventos
// normales, solo se lo bloquea si intenta prender cobro online o sala de espera/aforo.
async function assertEventPlanFeatures(tenantId: number, data: Partial<z.infer<typeof eventInputSchema>>): Promise<string | null> {
	const wantsOnlinePayment = data.paymentMode != null && data.paymentMode !== 'NONE';
	const wantsWaitingRoomOrCapacity = data.waitingRoomEnabled === true || data.maxCapacity != null;
	if (!wantsOnlinePayment && !wantsWaitingRoomOrCapacity) return null;

	const result = await getTenantPlanFeatures(tenantId);
	if (result.blocked) return result.reason;
	if (!result.features) return null; // tenant sin plan asignado, sin restricción (ver comentario en schema.prisma)
	if (wantsOnlinePayment && !result.features.onlinePayment) {
		return 'El cobro online no está incluido en tu plan actual.';
	}
	if (wantsWaitingRoomOrCapacity && !result.features.waitingRoomAndCapacity) {
		return 'La sala de espera y el aforo no están incluidos en tu plan actual.';
	}
	return null;
}

// Un tenant "evento único" (ver lib/event-plans.ts) pagó por UN evento — a diferencia de
// assertEventPlanFeatures (que gatea features premium), esto aplica siempre que el tenant sea de
// este tipo, sin depender de qué campos vengan en el payload. Solo limita CANTIDAD de eventos (1);
// NO limita el aforo — vender por encima de los asistentes incluidos en el tier no se bloquea acá,
// se cobra como overage (ver lib/overage.ts), mismo criterio que los planes recurrentes.
async function assertEventOncePlanCap(tenantId: number): Promise<string | null> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
	if (!tenant || !isEventPlanCode(tenant.plan)) return null;

	const existingCount = await prisma.event.count({ where: { tenantId } });
	if (existingCount >= 1) {
		return 'Tu plan de evento único incluye un solo evento. Actualizá a un plan recurrente desde Suscripción para crear más.';
	}
	return null;
}

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

// Estado en vivo de un evento en pleno pico de demanda: cuánta gente hay en la fila/admitida (ver
// lib/waiting-room.ts, no hace falta chequear waitingRoomEnabled acá — si nunca hubo un join,
// getWaitingRoomStats devuelve 0/0 sin tocar la DB) más cuántos asientos quedan disponibles del
// total permitido — así el manager ve el cupo bajando en vivo mientras la fila se vacía. El
// frontend solo pollea esto para eventos con waitingRoomEnabled (ver event-card.component.ts), así
// que el costo de las dos queries extra acá no pega en el resto de los eventos.
eventsRouter.get('/:id/live-stats', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const event = await prisma.event.findUnique({ where: { id, tenantId }, select: { code: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	const tickets = await prisma.ticket.findMany({ where: { eventId: id, tenantId, active: true }, select: { count: true } });
	const availableCount = tickets.reduce((sum, t) => sum + t.count, 0);
	const soldCount = await prisma.saleTicket.count({ where: { eventId: id, tenantId } });
	res.json({ ...getWaitingRoomStats(event.code), soldCount, availableCount, totalCapacity: availableCount + soldCount });
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

	const planError = await assertEventPlanFeatures(tenantId, data);
	if (planError) {
		res.status(403).json({ error: planError });
		return;
	}
	const onceCapError = await assertEventOncePlanCap(tenantId);
	if (onceCapError) {
		res.status(409).json({ error: onceCapError });
		return;
	}

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

	const planError = await assertEventPlanFeatures(tenantId, eventData);
	if (planError) {
		res.status(403).json({ error: planError });
		return;
	}

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
