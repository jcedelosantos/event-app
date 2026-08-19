import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { isClubTenant, validateAttendeeRule, principalCarnet, MAX_INVITADOS_PER_SOCIO } from '../lib/attendee';
import { lookupClubMember, assertActiveMember } from '../lib/club-members';
import { assertEventCapacity } from '../lib/capacity';
import { notifyIfOverageJustCrossed } from '../lib/overage';
import { uniqueUsername } from '../lib/unique-username';
import { resolveFamilyCodeQR } from '../lib/family-code';
import { checkDuplicateEventRegistration } from '../lib/duplicate-event-guard';
import { createOrder as createPaypalOrder, captureOrder as capturePaypalOrder, verifyWebhookSignature, PayPalNotConfiguredError, PayPalRequestError } from '../lib/paypal';
import { finalizePaidSaleTickets } from '../lib/checkout';
import { findDuplicateEventSlot } from '../lib/find-duplicate-event-slot';
import { extractEventFromImage, AnthropicNotConfiguredError, AnthropicRequestError } from '../lib/event-extraction';
import { getTenantPlanFeatures } from '../middleware/plan';
import { getTenantConfig as getWhatsAppConfig, verifySignature as verifyWhatsAppSignature, downloadMedia, sendTextMessage, WhatsAppNotConfiguredError } from '../lib/whatsapp';
import { saveBuffer, uploadsDir } from '../lib/uploads';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { logAudit } from '../lib/audit';
import { joinWaitingRoom, getWaitingRoomStatus } from '../lib/waiting-room';
import { serializableTransaction } from '../lib/serializable-tx';
import { generatePublicSlug } from './events';
import { effectiveSalesCloseAt } from '../lib/event-time';

export const publicRouter = Router();

class InsufficientStockError extends Error {}
class NoMealConfiguredError extends Error {}
// Mensaje ya armado (aforo del evento alcanzado, o tope de invitados del socio alcanzado) —
// descubierto DENTRO de la transacción de compra, se relanza para que el catch de más abajo lo
// devuelva tal cual en vez de un mensaje genérico.
class TransactionValidationError extends Error {}

const MAX_SEATS_PER_ORDER = 5;
// Tiempo que un asiento queda "apartado" (SaleTicket en PENDING) mientras el comprador paga —
// vencido esto, el próximo intento de reservar ESE asiento lo libera solo (ver releaseExpiredHolds),
// sin necesitar un cron aparte.
const HOLD_MINUTES = 15;

// Libera asientos cuyo hold (SaleTicket PENDING) ya venció, devolviendo el cupo al stock del
// ticket — se llama al principio de /checkout/hold, ANTES de chequear disponibilidad, así un
// comprador que abandonó el pago no deja el asiento bloqueado para siempre.
//
// La lectura de los holds vencidos vive DENTRO de la misma transacción serializable que los borra e
// incrementa el stock — separada, dos requests concurrentes liberando el mismo evento podían leer el
// mismo lote antes de que ninguna terminara de escribir, e incrementar `Ticket.count` dos veces por
// el mismo hold (stock inflado por encima de la disponibilidad real).
async function releaseExpiredHolds(tenantId: number, eventId: number, seatIds: number[]) {
	await serializableTransaction(async (tx) => {
		const expired = await tx.saleTicket.findMany({
			where: { eventId, seatId: { in: seatIds }, tenantId, paymentStatus: 'PENDING', paymentExpiresAt: { lt: new Date() } },
		});
		if (!expired.length) return;
		for (const s of expired) {
			await tx.ticket.update({ where: { id: s.ticketId, tenantId }, data: { count: { increment: 1 } } });
		}
		await tx.saleTicket.deleteMany({ where: { id: { in: expired.map((s: { id: number }) => s.id) }, tenantId } });
	});
}

// Rutas sin auth: las usa el cliente final desde el link/QR del evento, no tiene cuenta de manager.
// Al ser público y sin autenticación es la superficie más expuesta de toda la API — el wrap con
// asyncHandler acá es todavía más importante que en el resto de las rutas.
//
// El evento se resuelve por `code` (único globalmente) usando `prismaUnscoped` — es el único lookup
// legítimo sin tenantId de todo el backend, porque acá todavía no sabemos a qué tenant pertenece la
// visita. Una vez resuelto el evento, TODO lo demás se filtra por `event.tenantId` con el cliente
// normal (con tenant-guard), así ninguna query subsiguiente puede fugarse a otro tenant.

// Portada pública de una organización: lista sus próximos eventos activos, para que un comprador
// que no tiene el link de un evento puntual pueda ver "todo lo que hay" de ese club/iglesia en un
// solo lugar. Igual que /events/:code, el tenant se resuelve por slug (único globalmente) con
// prismaUnscoped — es el único lookup legítimo sin tenantId, porque acá todavía no lo sabemos.
publicRouter.get('/org/:slug', asyncHandler(async (req, res) => {
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug: req.params.slug } });
	if (!tenant || !tenant.active) {
		res.status(404).json({ error: 'Organización no encontrada' });
		return;
	}
	// El portal público es una feature de Intermedio para arriba — un tenant Básico responde 404
	// acá, igual que una organización que no existe, en vez de un mensaje de "necesitas upgrade" que
	// le confirmaría a cualquiera que el slug SÍ corresponde a un tenant real.
	const planCheck = await getTenantPlanFeatures(tenant.id);
	if (planCheck.blocked || (planCheck.features && !planCheck.features.publicPortal)) {
		res.status(404).json({ error: 'Organización no encontrada' });
		return;
	}

	// Sin filtro de dateOff acá a propósito — el filtro de "próximos vs. vencidos" ahora lo aplica el
	// frontend (ver org-landing.component.ts), que necesita poder mostrar los vencidos bajo demanda
	// cuando el visitante activa ese chip. `take` es la red de seguridad para no traer un histórico
	// sin límite en un tenant con muchos años de eventos — 300 eventos alcanza de sobra para
	// cualquier club real y evita un query sin acotar en un endpoint público.
	const events = await prisma.event.findMany({
		where: { tenantId: tenant.id, active: true },
		orderBy: { dateOn: 'desc' },
		take: 300,
		select: {
			id: true,
			name: true,
			code: true,
			// El link de cada tarjeta usa publicSlug, no code (ver org-landing.component.ts) — code
			// queda igual acá solo por si algún otro campo del frontend lo necesita a futuro.
			publicSlug: true,
			img: true,
			description: true,
			dateOn: true,
			dateOff: true,
			startTime: true,
			publishAt: true,
			maxCapacity: true,
			status: true,
			map: { select: { name: true } },
			tickets: { where: { active: true }, select: { count: true } },
		},
	});

	// Aforo: distinto de soldOut (stock por tipo de ticket agotado) — un evento puede tener stock de
	// sobra en cada tipo de ticket y aun así estar lleno si ya alcanzó el cupo compartido (ver
	// Event.maxCapacity, lib/capacity.ts). Solo se pega a la DB por el conteo de vendidos en los
	// eventos que de verdad tienen un tope configurado.
	const soldCountByEventId = new Map<number, number>();
	const eventsWithCap = events.filter((e) => e.maxCapacity != null);
	if (eventsWithCap.length) {
		const counts = await prisma.saleTicket.groupBy({
			by: ['eventId'],
			where: { eventId: { in: eventsWithCap.map((e) => e.id) }, tenantId: tenant.id },
			_count: { _all: true },
		});
		for (const c of counts) soldCountByEventId.set(c.eventId, c._count._all);
	}

	res.json({
		name: tenant.name,
		slug: tenant.slug,
		type: tenant.type,
		logoUrl: tenant.logoUrl,
		// soldOut/inactive/scheduled/capacityFull se calculan acá para no exponer tickets/precios en
		// este listado público — la portada solo necesita saber si puede o no llevar al comprador a
		// /e/:code, y con qué etiqueta. "scheduled" (Event.publishAt a futuro) a propósito NO excluye
		// el evento del listado (el manager pidió explícitamente que quede visible, solo no elegible
		// hasta esa fecha) — la venta en sí se sigue bloqueando en el backend (ver /purchase,
		// /checkout/hold). publishAt se manda tal cual (no solo el booleano `scheduled`) para que la
		// portada pueda mostrar la fecha/hora exacta o un conteo regresivo en el badge (ver
		// org-landing.component.ts).
		events: events.map(({ tickets, maxCapacity, ...event }) => ({
			...event,
			inactive: !tickets.length,
			soldOut: tickets.length > 0 && tickets.every((t) => t.count <= 0),
			scheduled: !!event.publishAt && event.publishAt > new Date(),
			capacityFull: maxCapacity != null && (soldCountByEventId.get(event.id) ?? 0) >= maxCapacity,
		})),
	});
}));

publicRouter.get('/events/:code', asyncHandler(async (req, res) => {
	const event = await prismaUnscoped.event.findUnique({
		where: { publicSlug: req.params.code },
		include: {
			map: { include: { areas: { include: { seats: true, tables: true } } } },
			tickets: { where: { active: true } },
			tenant: { select: { type: true, name: true, logoUrl: true } },
		},
	});
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	// A diferencia de /org/:slug (portal con todos los eventos, feature de Intermedio para arriba),
	// el link directo de UN evento puntual funciona en cualquier plan — un tenant Básico igual puede
	// compartir el QR/link de un evento y vender por ahí, solo no tiene la portada que lista todos
	// sus eventos. Sí se respeta `blocked` (suscripción no ACTIVE) — eso corta toda venta, sin
	// importar el plan.
	const planCheck = await getTenantPlanFeatures(event.tenantId);
	if (planCheck.blocked) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const soldSeats = await prisma.saleTicket.findMany({ where: { eventId: event.id, tenantId: event.tenantId }, select: { seatId: true } });
	const soldSeatIds = new Set(soldSeats.map((s) => s.seatId));

	const mealProduct = await prisma.product.findFirst({ where: { eventId: event.id, tenantId: event.tenantId, isMealOfTheDay: true }, select: { id: true } });

	// Solo se arman a mano estas keys puntuales (nunca un dump de AppSetting) — así el secret de
	// PayPal (payments.paypalSecret) jamás puede llegar a este endpoint público, sin depender de que
	// el filtro de GET /settings se mantenga correcto para siempre (ver settings.ts).
	// exchangeRateRD se consulta siempre (no solo si hay paymentMode): el precio en USD de "Elige tu
	// ticket" se muestra igual para eventos sin cobro online (paga en la puerta), así que la
	// cotización en pesos tiene que estar disponible ahí también.
	const paymentSettings = await prisma.appSetting.findMany({
		where: { tenantId: event.tenantId, key: { in: ['payments.paypalClientId', 'payments.linkUrl', 'payments.exchangeRateRD'] } },
	});
	const settingsMap = Object.fromEntries(paymentSettings.map((s) => [s.key, s.value]));
	const exchangeRateRD = settingsMap['payments.exchangeRateRD'] ? Number(settingsMap['payments.exchangeRateRD']) : null;

	let payment: { mode: string; paypalClientId: string | null; linkUrl: string | null } | null = null;
	if (event.paymentMode !== 'NONE') {
		payment = {
			mode: event.paymentMode,
			paypalClientId: settingsMap['payments.paypalClientId'] ?? null,
			linkUrl: settingsMap['payments.linkUrl'] ?? null,
		};
	}

	const map = event.map
		? {
				...event.map,
				areas: event.map.areas.map((area) => ({
					...area,
					seats: area.seats.map((seat) => ({ ...seat, available: !soldSeatIds.has(seat.id) })),
				})),
			}
		: null;

	res.json({
		id: event.id,
		name: event.name,
		code: event.code,
		description: event.description,
		img: event.img,
		dateOn: event.dateOn,
		dateOff: event.dateOff,
		startTime: event.startTime,
		// El comprador puede ver el evento antes de esta fecha (queda visible, no oculto) — el frontend
		// lo usa para bloquear la compra y mostrar "disponible a partir de..." (ver
		// public-event.component.ts purchaseBlockedReason). El bloqueo real vive en el backend
		// (/purchase, /checkout/hold), esto es solo para el mensaje.
		publishAt: event.publishAt,
		tickets: event.tickets,
		map,
		// El picker público lo usa para saber si tiene que pedir socio/invitado + carnet — ver
		// lib/attendee.ts. Solo importa el tipo, no se expone nada más del tenant acá.
		tenantType: event.tenant?.type ?? 'GENERAL',
		// Branding del club en la página del evento (ver public-event.component.ts) — mismo patrón que
		// waiting-room.ts, ningún otro dato del tenant se expone acá.
		tenantName: event.tenant?.name ?? null,
		tenantLogoUrl: event.tenant?.logoUrl ?? null,
		hasMealOfTheDay: !!mealProduct,
		payment,
		// RD$ por USD, configurado en Settings → Pagos — null si el club nunca lo cargó (el frontend
		// muestra solo USD en ese caso, mismo comportamiento que antes de este campo).
		exchangeRateRD,
		// Solo relevante en tenants CLUB (ver lib/attendee.ts) — cuántos invitados puede cargar un
		// socio en su propia compra o por auto-registro independiente (mismo tope, mismo pool, ver
		// /sponsor-status). Se manda igual para cualquier tenant, inofensivo si no se usa.
		maxGuestsPerSponsor: event.maxGuestsPerSponsor ?? MAX_INVITADOS_PER_SOCIO,
		// Aforo compartido entre todos los tickets (ver Event.maxCapacity, lib/capacity.ts) — distinto
		// de que cada tipo de ticket tenga stock: el evento puede estar lleno igual. `soldSeats` ya se
		// consultó arriba para marcar disponibilidad de asientos, se reusa el mismo conteo acá. El
		// frontend lo usa para bloquear la compra ANTES de intentarla (ver purchaseBlockedReason en
		// public-event.component.ts) — el bloqueo real de todas formas vive en el backend.
		capacityFull: event.maxCapacity != null && soldSeats.length >= event.maxCapacity,
		// ACTIVE | CANCELLED | POSTPONED — el frontend lo usa para mostrar un aviso claro y bloquear el
		// botón de compra ANTES de intentarla (el bloqueo real vive en /purchase y /checkout/hold).
		status: event.status,
	});
}));

// Página de encuesta post-evento (ver lib/mail.ts sendTicketEmail + create-event-modal
// Event.surveyUrl) — el gate real de "todavía no terminó el evento" vive ACÁ, del lado del
// servidor, porque el link del email ya salió y no se puede recontrolar después. dateOff siempre
// tiene un valor concreto una vez creado el evento (ver events.ts POST: default a dateOn si no se
// especifica), así que no hace falta un fallback +horas acá.
publicRouter.get('/survey/:code', asyncHandler(async (req, res) => {
	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: req.params.code }, select: { surveyUrl: true, dateOff: true } });
	if (!event || !event.surveyUrl) {
		res.status(404).json({ error: 'Encuesta no encontrada' });
		return;
	}
	if (new Date() < event.dateOff) {
		res.json({ ready: false });
		return;
	}
	res.json({ ready: true, surveyUrl: event.surveyUrl });
}));

// Chequeo previo de socio/invitado — el picker público lo usa apenas se completa el carnet del
// socio que invita, ANTES de dejar elegir asiento, para no hacer perder tiempo armando una
// selección que después el submit va a rechazar igual (ver validateAttendeeRule, misma regla,
// única fuente de verdad real). Dos motivos de bloqueo: el socio todavía no compró su propia
// entrada para este evento (un invitado no puede "entrar solo"), o ya alcanzó su tope de invitados.
publicRouter.get('/events/:code/sponsor-status', asyncHandler(async (req, res) => {
	const carnet = String(req.query.carnet ?? '').trim();
	if (!carnet) {
		res.status(400).json({ error: 'Falta el carnet del socio' });
		return;
	}

	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: req.params.code }, select: { id: true, tenantId: true, maxGuestsPerSponsor: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	const max = event.maxGuestsPerSponsor ?? MAX_INVITADOS_PER_SOCIO;

	if (!(await isClubTenant(event.tenantId))) {
		res.json({ registered: true, used: 0, max, blocked: false });
		return;
	}

	// Mismo criterio que validateAttendeeRule: el carnet se compara por su titular (principalCarnet),
	// no con `equals` de Prisma — así "C6735" y "c6735" cuentan como el mismo socio, y "v3345"/
	// "v3345-0" (carnet dependiente) comparten el mismo pool de invitados.
	const normalizedCarnet = principalCarnet(carnet);
	const socioSales = await prisma.saleTicket.findMany({
		where: { eventId: event.id, tenantId: event.tenantId, attendeeType: 'SOCIO' },
		select: { client: { select: { carnet: true } } },
	});
	const sponsorRegistered = socioSales.some((s) => principalCarnet(s.client.carnet ?? '') === normalizedCarnet);
	const invitadoSales = await prisma.saleTicket.findMany({
		where: { eventId: event.id, tenantId: event.tenantId, attendeeType: 'INVITADO' },
		select: { sponsorCarnet: true },
	});
	const used = invitadoSales.filter((s) => principalCarnet(s.sponsorCarnet ?? '') === normalizedCarnet).length;
	res.json({
		registered: !!sponsorRegistered,
		used,
		max,
		blocked: !sponsorRegistered || used >= max,
	});
}));

// El picker público lo llama apenas un SOCIO completa SU PROPIO carnet en "1. Tus datos", para
// autocompletar nombre/apellido/email/teléfono y confirmar que puede comprar como socio — a
// diferencia de /sponsor-status (que valida el carnet de OTRA persona, el socio que invita), acá sí
// se devuelven los datos de contacto porque es el propio dueño del carnet consultándose a sí mismo.
// `found` y `active` van separados (en vez de un solo booleano) para poder distinguir "ese carnet no
// existe" de "existe pero está inactivo" en el mensaje que ve el socio — información útil para él,
// sin el riesgo de privacidad que sí tendría exponer eso de un tercero.
publicRouter.get('/events/:code/member-status', asyncHandler(async (req, res) => {
	const carnet = String(req.query.carnet ?? '').trim();
	if (!carnet) {
		res.status(400).json({ error: 'Falta el carnet' });
		return;
	}

	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: req.params.code }, select: { tenantId: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	if (!(await isClubTenant(event.tenantId))) {
		res.json({ found: false, active: false });
		return;
	}

	const member = await lookupClubMember(event.tenantId, carnet);
	if (!member) {
		res.json({ found: false, active: false });
		return;
	}
	res.json({
		found: true,
		active: member.active,
		// Solo se manda el resto de los datos si está activo — el mensaje de bloqueo para el caso
		// inactivo usa el carnet, no el nombre del socio (decisión explícita del club por
		// privacidad), así que no hay necesidad de exponer sus datos personales acá.
		...(member.active ? { name: member.name, lastname: member.lastname, email: member.email, phone: member.phone } : {}),
	});
}));

// Mismo espíritu que /sponsor-status: el picker público lo llama apenas se completa email/carnet en
// "1. Tus datos", ANTES de dejar elegir asiento — así un socio/invitado que ya se registró en otra
// función del mismo evento (ver Event.duplicateGroupKey) se entera de una al toque, en vez de armar
// toda la selección de asiento para recién enterarse del rechazo al confirmar (bug real reportado).
publicRouter.get('/events/:code/duplicate-check', asyncHandler(async (req, res) => {
	const email = String(req.query.email ?? '').trim();
	const carnet = String(req.query.carnet ?? '').trim();
	if (!email) {
		res.json({ blocked: false, reason: null });
		return;
	}

	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: req.params.code }, select: { id: true, tenantId: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	if (!(await isClubTenant(event.tenantId))) {
		res.json({ blocked: false, reason: null });
		return;
	}

	// Chequeo informativo previo a la compra real (el picker lo usa para avisar temprano) — no crea
	// nada, así que no necesita transacción; la aplicación real de la regla pasa por la transacción
	// serializable de /purchase o /checkout/hold más abajo.
	// `as any`: mismo motivo estructural documentado en lib/duplicate-event-guard.ts — el tipo
	// generado del cliente extendido (tenant-guard) no encaja limpio contra el structural type
	// mínimo, y acá (fuera de una transacción) no hay un `tx` ya tipado `any` de por medio.
	const reason = await checkDuplicateEventRegistration(prisma as any, { tenantId: event.tenantId, eventId: event.id, clientEmail: email, clientCarnet: carnet });
	res.json({ blocked: !!reason, reason });
}));

// Sala de espera virtual (opt-in por evento, ver Event.waitingRoomEnabled) — el picker público llama
// esto ANTES de pegarle a GET /events/:code (la query pesada con mapa/áreas/asientos/tickets), así
// la gente en cola no dispara esa query hasta estar admitida. Si el evento no tiene la sala de
// espera prendida, responde `enabled:false` de inmediato — cero cambio de comportamiento y cero
// costo extra para el resto de los eventos. Ver lib/waiting-room.ts para el diseño completo.
const waitingRoomJoinSchema = z.object({ sessionId: z.string().min(1) });

publicRouter.post('/events/:code/waiting-room/join', asyncHandler(async (req, res) => {
	const parsed = waitingRoomJoinSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: 'Falta sessionId' });
		return;
	}
	const result = await joinWaitingRoom(req.params.code, parsed.data.sessionId);
	res.json(result);
}));

publicRouter.get('/events/:code/waiting-room/status', asyncHandler(async (req, res) => {
	const sessionId = String(req.query.sessionId ?? '');
	if (!sessionId) {
		res.status(400).json({ error: 'Falta sessionId' });
		return;
	}
	const result = await getWaitingRoomStatus(req.params.code, sessionId);
	res.json(result);
}));

const registerSchema = z.object({
	name: z.string().min(1),
	// Igual que la importación masiva de CSV: el nombre completo suele venir todo junto en `name`,
	// así que apellido queda opcional para no bloquear el registro por un dato que ya está incluido.
	lastname: z.string().optional().default(''),
	email: z.string().email(),
	phone: z.string().min(1),
	// Ya no es obligatorio a nivel de schema: en un tenant CLUB, un invitado no tiene carnet propio
	// (usa el del socio que lo invita, ver sponsorCarnet más abajo) — la obligatoriedad para socios
	// se valida aparte con validateAttendeeRule, que sí conoce el tipo de tenant y el attendeeType.
	carnet: z.string().optional().default(''),
});

// Solo se usa en tenants CHURCH (ver public-event.component.ts) — un comprador sin cuenta previa no
// puede pegarle a POST /children (requiere auth de staff), así que acá el registro de hijos se
// resuelve en la misma transacción de compra en vez de un segundo call, a diferencia de la venta
// manual (sale-tickets.ts + POST /children aparte).
const childInputSchema = z.object({
	name: z.string().min(1),
	age: z.coerce.number().int().min(0).max(17).optional(),
	wantsMeal: z.boolean().optional().default(false),
});

// Solo tiene sentido en tenants CLUB (ver public-event.component.ts): un SOCIO puede cargar a sus
// invitados con identidad propia dentro de su propia compra, en vez de que cada uno tenga que
// entrar al link por su cuenta y auto-registrarse con el carnet del socio (ese camino sigue
// existiendo por separado, ver /sponsor-status). Sin carnet propio — los invitados no tienen uno,
// se identifican por nombre. Email opcional: si no lo dan, se genera un placeholder interno (ver
// más abajo) solo para satisfacer el constraint de User, nunca se le envía nada.
const guestInputSchema = z.object({
	name: z.string().min(1),
	lastname: z.string().min(1),
	phone: z.string().min(1),
	email: z.string().email().optional(),
});

const purchaseSchema = z.object({
	eventCode: z.string().min(1),
	ticketId: z.number().int(),
	client: registerSchema,
	seatIds: z.array(z.number().int()).min(1).max(MAX_SEATS_PER_ORDER),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).optional(),
	sponsorCarnet: z.string().optional(),
	children: z.array(childInputSchema).optional().default([]),
	guests: z.array(guestInputSchema).max(MAX_SEATS_PER_ORDER - 1).optional(),
});

publicRouter.post('/purchase', checkoutRateLimiter, asyncHandler(async (req, res) => {
	const parsed = purchaseSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds, attendeeType, sponsorCarnet, children, guests } = parsed.data;

	// Los invitados con datos propios (nombre/apellido/teléfono) solo tienen sentido dentro de la
	// compra de un SOCIO — necesitan un sponsor, y acá el sponsor es la propia persona que compra.
	// Se valida temprano, antes de tocar la DB, junto con que la cantidad de asientos elegidos
	// coincida exactamente con "el socio + cada invitado cargado" (no de más, no de menos).
	if (guests?.length) {
		if (attendeeType !== 'SOCIO') {
			res.status(400).json({ error: 'Los invitados con datos propios solo se pueden cargar en la compra de un socio.' });
			return;
		}
		if (seatIds.length !== 1 + guests.length) {
			res.status(400).json({ error: 'La cantidad de asientos elegidos no coincide con tu asiento más el de cada invitado.' });
			return;
		}
	}

	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	if (event.status !== 'ACTIVE') {
		res.status(409).json({ error: event.status === 'CANCELLED' ? 'Este evento fue cancelado.' : 'Este evento fue pospuesto — todavía no hay una nueva fecha confirmada para comprar.' });
		return;
	}
	// Repite acá el mismo gate que ya aplica el frontend (ver public-event.component.ts) — sin esto,
	// alguien podría comprar igual pegándole directo a este endpoint, sin pasar por la UI. Ojo: NO se
	// chequea dateSale acá — hoy siempre es igual a dateOn (nadie lo edita, la UI no lo expone), así
	// que tratarlo como "inicio de venta" bloquearía la compra de eventos vigentes hasta el mismo día
	// del evento. El gate real de "inicio de venta" es Event.publishAt (opcional, ver abajo).
	if (effectiveSalesCloseAt(event) < new Date()) {
		res.status(409).json({ error: 'Las ventas para este evento ya cerraron.' });
		return;
	}
	if (event.publishAt && event.publishAt > new Date()) {
		res.status(409).json({ error: 'Este evento todavía no está disponible para la venta.' });
		return;
	}
	const tenantId = event.tenantId;

	const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, eventId: event.id, tenantId } });
	if (!ticket) {
		res.status(400).json({ error: 'El ticket elegido no pertenece a este evento' });
		return;
	}

	const alreadySold = await prisma.saleTicket.findMany({ where: { eventId: event.id, seatId: { in: seatIds }, tenantId } });
	if (alreadySold.length) {
		res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Vuelve a intentarlo.' });
		return;
	}

	const isClub = await isClubTenant(tenantId);
	// Un club normalmente vende por socio/invitado, pero un ticket cargado desde un flyer por
	// WhatsApp puede venir sin esa clasificación (ej. tickets por edad) — la regla socio/invitado
	// solo tiene sentido si ESTE ticket puntual participa de ese modelo (mismo criterio que
	// public-event.component.ts, eventUsesAttendeeTypeTickets). Esta lectura en sí no decide cupo —
	// lo que sí cuenta invitados/registros existentes (validateAttendeeRule,
	// checkDuplicateEventRegistration) se valida más abajo, DENTRO de la transacción serializable,
	// junto con la creación — así una carrera bajo Postgres no puede colar dos altas que individualmente
	// pasarían el chequeo pero juntas superan el tope.
	if (isClub && ticket.attendeeType != null && attendeeType === 'SOCIO') {
		// Solo en el flujo self-service: un SOCIO tiene que existir y estar activo en la simulación
		// de membresía del club (ver lib/club-members.ts) — el invitado no se valida acá, su regla
		// (socio que lo invita ya registrado, tope de invitados) la cubre validateAttendeeRule.
		const memberError = await assertActiveMember(tenantId, clientData.carnet);
		if (memberError) {
			res.status(400).json({ error: memberError });
			return;
		}
	}

	const clientType = await prisma.userType.findFirst({ where: { type: 'CLIENT' } });
	if (!clientType) {
		res.status(500).json({ error: 'No existe el tipo de usuario CLIENT' });
		return;
	}
	let client = await prisma.user.findFirst({ where: { email: clientData.email, tenantId } });
	if (!client) {
		const hashed = await bcrypt.hash(randomUUID(), 10);
		client = await prisma.user.create({
			data: {
				username: await uniqueUsername(prisma, clientData.email),
				password: hashed,
				name: clientData.name,
				lastname: clientData.lastname,
				email: clientData.email,
				phone: clientData.phone,
				gender: '',
				adress: '',
				carnet: clientData.carnet,
				typeId: clientType.id,
				tenantId,
			},
		});
	} else if (!client.carnet && clientData.carnet) {
		// Mismo backfill que en /register — un cliente que ya compró antes sin carnet lo completa acá.
		client = await prisma.user.update({ where: { id: client.id }, data: { carnet: clientData.carnet } });
	}

	// Las compras de autoservicio no tienen un vendedor humano — se registran a nombre del primer
	// usuario ROOT de ESTE tenant (el admin de la cuenta) para no volver nullable la relación seller
	// en el schema.
	const rootUser = await prisma.user.findFirst({ where: { type: { type: 'ROOT' }, tenantId } });
	if (!rootUser) {
		res.status(500).json({ error: 'No hay un usuario administrador configurado' });
		return;
	}

	const include = {
		event: true,
		seat: { include: { area: true } },
		ticket: true,
		client: { include: { type: true } },
		seller: { include: { type: true } },
	};

	try {
		const { saleTickets, createdChildren } = await serializableTransaction(async (tx) => {
			// Un club normalmente vende por socio/invitado, pero un ticket cargado desde un flyer por
			// WhatsApp puede venir sin esa clasificación — la regla solo aplica si ESTE ticket puntual
			// participa de ese modelo (mismo criterio que public-event.component.ts).
			if (isClub && ticket.attendeeType != null) {
				const attendeeError = await validateAttendeeRule(tx, {
					tenantId,
					eventId: event.id,
					attendeeType,
					sponsorCarnet,
					clientCarnet: clientData.carnet,
					newInviteCount: seatIds.length,
					maxGuestsOverride: event.maxGuestsPerSponsor,
				});
				if (attendeeError) throw new TransactionValidationError(attendeeError);
			}
			// "Misma función, otra fecha" es independiente del modelo de tickets del evento — aplica a
			// cualquier evento CLUB dentro de un grupo vinculado, tenga o no tickets socio/invitado.
			if (isClub) {
				const duplicateError = await checkDuplicateEventRegistration(tx, {
					tenantId,
					eventId: event.id,
					clientEmail: clientData.email,
					clientCarnet: clientData.carnet,
				});
				if (duplicateError) throw new TransactionValidationError(duplicateError);
			}

			const capacityError = await assertEventCapacity(tx, { eventId: event.id, tenantId, maxCapacity: event.maxCapacity, requestedSeats: seatIds.length });
			if (capacityError) {
				throw new TransactionValidationError(capacityError);
			}
			// Mismo chequeo-y-descuento atómico que la venta manual (sale-tickets.ts) — acá se
			// descuenta de una sola vez la cantidad de asientos elegidos, así una compra de autoservicio
			// nunca deja vender más tickets de un tipo que el cupo configurado.
			const stockUpdate = await tx.ticket.updateMany({
				where: { id: ticket.id, count: { gte: seatIds.length }, tenantId },
				data: { count: { decrement: seatIds.length } },
			});
			if (stockUpdate.count === 0) {
				throw new InsufficientStockError();
			}

			let saleTickets;
			if (guests?.length) {
				// El socio carga a sus invitados con nombre propio en su misma compra — cada uno termina
				// con su propio `client`/SaleTicket, en vez de que las 5 seats posibles del ticket "Socio"
				// terminen todas bajo el nombre del socio (el problema real que esto resuelve, ver
				// public-event.component.ts effectiveMaxSeats). seatIds[0] es siempre el asiento del
				// socio; el resto, uno por invitado, en el mismo orden que `guests`.
				const socioTicket = await tx.saleTicket.create({
					data: {
						eventId: event.id,
						seatId: seatIds[0],
						ticketId: ticket.id,
						userId: rootUser.id,
						clientId: client!.id,
						paidType: 'Online',
						description: 'Compra autoservicio',
						codeQR: randomUUID(),
						tenantId,
						channel: 'PUBLIC',
						attendeeType: 'SOCIO',
						priceCents: ticket.priceCents,
					},
					include,
				});

				// El socio ya quedó registrado (arriba, en esta misma tx) — validateAttendeeRule ahora lo
				// encuentra sin depender de una compra previa, y cuenta juntos los invitados ya cargados
				// por este camino o por el auto-registro independiente (mismo tope, mismo pool, ver
				// principalCarnet en lib/attendee.ts para el pooling con carnets dependientes).
				const guestCapError = await validateAttendeeRule(tx, {
					tenantId,
					eventId: event.id,
					attendeeType: 'INVITADO',
					sponsorCarnet: clientData.carnet,
					clientCarnet: clientData.carnet,
					newInviteCount: guests.length,
					maxGuestsOverride: event.maxGuestsPerSponsor,
				});
				if (guestCapError) {
					throw new TransactionValidationError(guestCapError);
				}

				const guestTickets = [];
				for (let i = 0; i < guests.length; i++) {
					const guestInput = guests[i];
					// Sin email real, se genera un placeholder interno solo para satisfacer el
					// @@unique([tenantId, email]) de User — el invitado nunca lo ve ni recibe nada ahí,
					// el socio es quien recibe el único email con todos los QR (ver sendTicketEmail).
					const guestEmail = guestInput.email ?? `invitado-${randomUUID()}@sin-email.invitado`;
					let guestClient = await tx.user.findFirst({ where: { email: guestEmail, tenantId } });
					if (!guestClient) {
						const hashed = await bcrypt.hash(randomUUID(), 10);
						guestClient = await tx.user.create({
							data: {
								username: await uniqueUsername(tx, guestEmail),
								password: hashed,
								name: guestInput.name,
								lastname: guestInput.lastname,
								email: guestEmail,
								phone: guestInput.phone,
								gender: '',
								adress: '',
								carnet: '',
								typeId: clientType.id,
								tenantId,
							},
						});
					}
					guestTickets.push(
						await tx.saleTicket.create({
							data: {
								eventId: event.id,
								seatId: seatIds[i + 1],
								ticketId: ticket.id,
								userId: rootUser.id,
								clientId: guestClient.id,
								paidType: 'Online',
								description: `Invitado de ${clientData.name}`,
								codeQR: randomUUID(),
								tenantId,
								channel: 'PUBLIC',
								attendeeType: 'INVITADO',
								sponsorCarnet: clientData.carnet.trim(),
								priceCents: ticket.priceCents,
							},
							include,
						}),
					);
				}
				saleTickets = [socioTicket, ...guestTickets];
			} else {
				saleTickets = await Promise.all(
					seatIds.map((seatId) =>
						tx.saleTicket.create({
							data: {
								eventId: event.id,
								seatId,
								ticketId: ticket.id,
								userId: rootUser.id,
								clientId: client!.id,
								paidType: 'Online',
								description: 'Compra autoservicio',
								codeQR: randomUUID(),
								tenantId,
								channel: 'PUBLIC',
								...(attendeeType ? { attendeeType, sponsorCarnet: attendeeType === 'INVITADO' ? sponsorCarnet?.trim() : null } : {}),
								priceCents: ticket.priceCents,
							},
							include,
						}),
					),
				);
			}

			// Registro de hijos (solo aplica en tenants CHURCH — ver children.ts para el mismo patrón
			// usado en la venta manual). Mismo chequeo-y-descuento atómico de stock que la comida del día.
			// Todos los hijos de esta compra comparten el mismo codeQR familiar (ver family-code.ts) —
			// se resuelve una sola vez afuera del loop para no repetir la búsqueda por cada hermano.
			const createdChildren = [];
			const familyCodeQR = children.length ? await resolveFamilyCodeQR(tx, { parentId: client!.id, eventId: event.id, tenantId }) : null;
			for (const childInput of children) {
				let saleProductId: number | undefined;
				if (childInput.wantsMeal) {
					const mealProduct = await tx.product.findFirst({ where: { eventId: event.id, tenantId, isMealOfTheDay: true } });
					if (!mealProduct) {
						throw new NoMealConfiguredError();
					}
					const mealStockUpdate = await tx.product.updateMany({
						where: { id: mealProduct.id, count: { gte: 1 }, tenantId },
						data: { count: { decrement: 1 } },
					});
					if (mealStockUpdate.count === 0) {
						throw new InsufficientStockError();
					}
					const saleProduct = await tx.saleProduct.create({
						data: {
							eventId: event.id,
							productId: mealProduct.id,
							quantity: 1,
							paidType: 'Incluido',
							description: `Comida del día para ${childInput.name}`,
							codeQR: randomUUID(),
							userId: rootUser.id,
							clientId: client!.id,
							tenantId,
							unitPriceCents: mealProduct.priceCents,
						},
					});
					saleProductId = saleProduct.id;
				}
				createdChildren.push(
					await tx.child.create({
						data: { name: childInput.name, age: childInput.age, eventId: event.id, parentId: client!.id, tenantId, codeQR: familyCodeQR!, saleProductId },
					}),
				);
			}

			return { saleTickets, createdChildren };
		});

		const publicSaleTickets = saleTickets.map(({ client: c, seller: s, ...rest }) => ({ ...rest, client: toPublicUser(c), seller: toPublicUser(s) }));

		sendTicketEmail({ to: clientData.email, clientName: clientData.name, event, saleTickets: publicSaleTickets }).catch((err) =>
			console.error('No se pudo enviar el email del ticket:', err),
		);

		res.status(201).json({
			saleTickets: publicSaleTickets,
			children: createdChildren.map((c) => ({ id: c.id, name: c.name, codeQR: c.codeQR })),
		});
		notifyIfOverageJustCrossed(tenantId, event.id, saleTickets.length).catch((err) => console.error('No se pudo verificar aforo:', err));
	} catch (err: any) {
		if (err instanceof TransactionValidationError) {
			res.status(409).json({ error: err.message });
			return;
		}
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay suficiente stock disponible para este tipo de ticket.' });
			return;
		}
		if (err instanceof NoMealConfiguredError) {
			res.status(400).json({ error: 'Este evento no tiene una comida del día configurada.' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Vuelve a intentarlo.' });
			return;
		}
		throw err;
	}
}));

// --- Checkout con pago (Event.paymentMode PAYPAL/LINK/BOTH) --------------------------------------
// Mismo espíritu que POST /purchase de arriba, pero en dos tiempos: acá solo se "aparta" el asiento
// (SaleTicket en PENDING, ver HOLD_MINUTES) — recién pasa a PAID (y ahí sí sale el email con el QR
// real) cuando se confirma el pago, ya sea por PayPal (capture/webhook) o a mano desde el panel de
// QRs (Opción "Link", ver sale-tickets.ts PUT /:id/mark-paid). A propósito NO soporta `children`
// (registro de hijos, solo CHURCH) en esta primera vuelta — un evento con cobro online vende solo
// tickets/asientos.
const checkoutHoldSchema = z.object({
	eventCode: z.string().min(1),
	ticketId: z.number().int(),
	client: registerSchema,
	seatIds: z.array(z.number().int()).min(1).max(MAX_SEATS_PER_ORDER),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).optional(),
	sponsorCarnet: z.string().optional(),
	provider: z.enum(['PAYPAL', 'LINK']),
});

publicRouter.post('/checkout/hold', checkoutRateLimiter, asyncHandler(async (req, res) => {
	const parsed = checkoutHoldSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds, attendeeType, sponsorCarnet, provider } = parsed.data;

	const event = await prismaUnscoped.event.findUnique({ where: { publicSlug: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	if (event.status !== 'ACTIVE') {
		res.status(409).json({ error: event.status === 'CANCELLED' ? 'Este evento fue cancelado.' : 'Este evento fue pospuesto — todavía no hay una nueva fecha confirmada para comprar.' });
		return;
	}
	if (event.paymentMode === 'NONE' || (provider === 'PAYPAL' && event.paymentMode === 'LINK') || (provider === 'LINK' && event.paymentMode === 'PAYPAL')) {
		res.status(400).json({ error: 'Este evento no acepta ese método de pago.' });
		return;
	}
	if (effectiveSalesCloseAt(event) < new Date()) {
		res.status(409).json({ error: 'Las ventas para este evento ya cerraron.' });
		return;
	}
	if (event.publishAt && event.publishAt > new Date()) {
		res.status(409).json({ error: 'Este evento todavía no está disponible para la venta.' });
		return;
	}
	const tenantId = event.tenantId;

	const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, eventId: event.id, tenantId } });
	if (!ticket) {
		res.status(400).json({ error: 'El ticket elegido no pertenece a este evento' });
		return;
	}

	await releaseExpiredHolds(tenantId, event.id, seatIds);

	const alreadySold = await prisma.saleTicket.findMany({ where: { eventId: event.id, seatId: { in: seatIds }, tenantId } });
	if (alreadySold.length) {
		res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Vuelve a intentarlo.' });
		return;
	}

	const isClub = await isClubTenant(tenantId);
	// Un club normalmente vende por socio/invitado, pero un ticket cargado desde un flyer por
	// WhatsApp puede venir sin esa clasificación (ej. tickets por edad) — la regla socio/invitado
	// solo tiene sentido si ESTE ticket puntual participa de ese modelo (mismo criterio que
	// public-event.component.ts, eventUsesAttendeeTypeTickets). Esta lectura en sí no decide cupo —
	// lo que sí cuenta invitados/registros existentes (validateAttendeeRule,
	// checkDuplicateEventRegistration) se valida más abajo, DENTRO de la transacción serializable,
	// junto con la creación — así una carrera bajo Postgres no puede colar dos altas que individualmente
	// pasarían el chequeo pero juntas superan el tope.
	if (isClub && ticket.attendeeType != null && attendeeType === 'SOCIO') {
		// Solo en el flujo self-service: un SOCIO tiene que existir y estar activo en la simulación
		// de membresía del club (ver lib/club-members.ts) — el invitado no se valida acá, su regla
		// (socio que lo invita ya registrado, tope de invitados) la cubre validateAttendeeRule.
		const memberError = await assertActiveMember(tenantId, clientData.carnet);
		if (memberError) {
			res.status(400).json({ error: memberError });
			return;
		}
	}

	const clientType = await prisma.userType.findFirst({ where: { type: 'CLIENT' } });
	if (!clientType) {
		res.status(500).json({ error: 'No existe el tipo de usuario CLIENT' });
		return;
	}
	let client = await prisma.user.findFirst({ where: { email: clientData.email, tenantId } });
	if (!client) {
		const hashed = await bcrypt.hash(randomUUID(), 10);
		client = await prisma.user.create({
			data: {
				username: await uniqueUsername(prisma, clientData.email),
				password: hashed,
				name: clientData.name,
				lastname: clientData.lastname,
				email: clientData.email,
				phone: clientData.phone,
				gender: '',
				adress: '',
				carnet: clientData.carnet,
				typeId: clientType.id,
				tenantId,
			},
		});
	} else if (!client.carnet && clientData.carnet) {
		client = await prisma.user.update({ where: { id: client.id }, data: { carnet: clientData.carnet } });
	}

	const rootUser = await prisma.user.findFirst({ where: { type: { type: 'ROOT' }, tenantId } });
	if (!rootUser) {
		res.status(500).json({ error: 'No hay un usuario administrador configurado' });
		return;
	}

	try {
		const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
		// Secreto compartido por todos los SaleTicket de ESTE hold — el frontend lo guarda junto con
		// los holdIds y lo devuelve en /checkout/paypal/order como prueba de que es el mismo comprador
		// que reservó (ver comentario en schema.prisma sobre SaleTicket.holdToken).
		const holdToken = randomUUID();
		const saleTickets = await serializableTransaction(async (tx) => {
			// Mismo motivo/orden que POST /purchase: estas dos reglas cuentan invitados/registros
			// existentes, así que quedan DENTRO de la transacción serializable junto con el cupo y la
			// creación del hold, no antes.
			if (isClub && ticket.attendeeType != null) {
				const attendeeError = await validateAttendeeRule(tx, {
					tenantId,
					eventId: event.id,
					attendeeType,
					sponsorCarnet,
					clientCarnet: clientData.carnet,
					newInviteCount: seatIds.length,
					maxGuestsOverride: event.maxGuestsPerSponsor,
				});
				if (attendeeError) throw new TransactionValidationError(attendeeError);
			}
			if (isClub) {
				const duplicateError = await checkDuplicateEventRegistration(tx, {
					tenantId,
					eventId: event.id,
					clientEmail: clientData.email,
					clientCarnet: clientData.carnet,
				});
				if (duplicateError) throw new TransactionValidationError(duplicateError);
			}

			const capacityError = await assertEventCapacity(tx, { eventId: event.id, tenantId, maxCapacity: event.maxCapacity, requestedSeats: seatIds.length });
			if (capacityError) {
				throw new TransactionValidationError(capacityError);
			}
			const stockUpdate = await tx.ticket.updateMany({
				where: { id: ticket.id, count: { gte: seatIds.length }, tenantId },
				data: { count: { decrement: seatIds.length } },
			});
			if (stockUpdate.count === 0) {
				throw new InsufficientStockError();
			}
			return Promise.all(
				seatIds.map((seatId) =>
					tx.saleTicket.create({
						data: {
							eventId: event.id,
							seatId,
							ticketId: ticket.id,
							userId: rootUser.id,
							clientId: client!.id,
							paidType: provider === 'PAYPAL' ? 'PayPal' : 'Link de pago',
							description: provider === 'PAYPAL' ? 'Checkout PayPal (pendiente)' : 'Link de pago (pendiente)',
							codeQR: randomUUID(),
							tenantId,
							channel: 'PUBLIC',
							paymentStatus: 'PENDING',
							paymentProvider: provider,
							paymentExpiresAt: expiresAt,
							holdToken,
							...(attendeeType ? { attendeeType, sponsorCarnet: attendeeType === 'INVITADO' ? sponsorCarnet?.trim() : null } : {}),
							priceCents: ticket.priceCents,
						},
					}),
				),
			);
		});

		res.status(201).json({
			holdIds: saleTickets.map((s) => s.id),
			holdToken,
			totalCents: ticket.priceCents * seatIds.length,
			expiresAt,
		});
		notifyIfOverageJustCrossed(tenantId, event.id, seatIds.length).catch((err) => console.error('No se pudo verificar aforo:', err));
	} catch (err: any) {
		if (err instanceof TransactionValidationError) {
			res.status(409).json({ error: err.message });
			return;
		}
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay suficiente stock disponible para este tipo de ticket.' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Vuelve a intentarlo.' });
			return;
		}
		throw err;
	}
}));

const paypalOrderSchema = z.object({ holdIds: z.array(z.number().int()).min(1), holdToken: z.string().min(1) });

publicRouter.post('/checkout/paypal/order', checkoutRateLimiter, asyncHandler(async (req, res) => {
	const parsed = paypalOrderSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	// `holdToken` ata este pedido al comprador que reservó (ver checkout/hold) — sin esto, cualquiera
	// que adivinara un holdId ajeno (ids secuenciales) podía disparar una orden PayPal real contra la
	// cuenta de OTRO tenant sin haber reservado nada.
	const holds = await prismaUnscoped.saleTicket.findMany({ where: { id: { in: parsed.data.holdIds } }, include: { ticket: true } });
	if (
		!holds.length ||
		holds.some((h) => h.paymentStatus !== 'PENDING' || h.paymentProvider !== 'PAYPAL' || h.holdToken !== parsed.data.holdToken)
	) {
		res.status(409).json({ error: 'Esta reserva ya no es válida — vuelve a elegir tu asiento.' });
		return;
	}
	if (holds.some((h) => !h.paymentExpiresAt || h.paymentExpiresAt < new Date())) {
		res.status(409).json({ error: 'El tiempo para pagar esta reserva venció — vuelve a elegir tu asiento.' });
		return;
	}

	const tenantId = holds[0].tenantId;
	const totalCents = holds.reduce((sum, h) => sum + h.ticket.priceCents, 0);

	try {
		const { orderId } = await createPaypalOrder(tenantId, totalCents, holds.map((h) => h.id).join(','));
		await prisma.saleTicket.updateMany({ where: { id: { in: holds.map((h) => h.id) }, tenantId }, data: { paypalOrderId: orderId } });
		res.json({ orderId });
	} catch (err) {
		if (err instanceof PayPalNotConfiguredError || err instanceof PayPalRequestError) {
			res.status(502).json({ error: err.message });
			return;
		}
		throw err;
	}
}));

const paypalCaptureSchema = z.object({ orderId: z.string().min(1) });

publicRouter.post('/checkout/paypal/capture', checkoutRateLimiter, asyncHandler(async (req, res) => {
	const parsed = paypalCaptureSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const holds = await prismaUnscoped.saleTicket.findMany({ where: { paypalOrderId: parsed.data.orderId } });
	if (!holds.length) {
		res.status(404).json({ error: 'No encontramos esa reserva.' });
		return;
	}
	const tenantId = holds[0].tenantId;

	try {
		if (holds.every((h) => h.paymentStatus === 'PAID')) {
			const result = await finalizePaidSaleTickets(tenantId, holds.map((h) => h.id));
			res.json(result);
			return;
		}
		const capture = await capturePaypalOrder(tenantId, parsed.data.orderId);
		if (capture.status !== 'COMPLETED') {
			res.status(409).json({ error: 'PayPal todavía no confirmó el pago — espera un momento y vuelve a intentar.' });
			return;
		}
		const result = await finalizePaidSaleTickets(tenantId, holds.map((h) => h.id));
		res.json(result);
	} catch (err) {
		if (err instanceof PayPalNotConfiguredError || err instanceof PayPalRequestError) {
			res.status(502).json({ error: err.message });
			return;
		}
		throw err;
	}
}));

// Notificación server-to-server de PayPal — fuente de verdad real del pago (ver Opción A del plan):
// captura del lado del cliente (arriba) es el camino rápido, esto es la red de seguridad si el
// comprador cierra la pestaña después de aprobar y antes de que nuestro capture llegue a dispararse.
publicRouter.post('/webhooks/paypal', asyncHandler(async (req, res) => {
	const resource = req.body?.resource;
	const orderId: string | undefined = req.body?.resource_type === 'checkout-order' ? resource?.id : resource?.supplementary_data?.related_ids?.order_id;
	if (!orderId) {
		res.json({ received: true });
		return;
	}

	const holds = await prismaUnscoped.saleTicket.findMany({ where: { paypalOrderId: orderId } });
	if (!holds.length) {
		res.json({ received: true });
		return;
	}
	const tenantId = holds[0].tenantId;

	const verified = await verifyWebhookSignature(tenantId, req.headers as Record<string, string | string[] | undefined>, req.body);
	if (!verified) {
		res.status(400).json({ error: 'Firma de webhook inválida' });
		return;
	}

	if (holds.every((h) => h.paymentStatus === 'PAID')) {
		res.json({ received: true });
		return;
	}

	try {
		const capture = await capturePaypalOrder(tenantId, orderId);
		if (capture.status === 'COMPLETED') {
			await finalizePaidSaleTickets(tenantId, holds.map((h) => h.id));
		}
	} catch (err) {
		console.error('Error procesando webhook de PayPal:', err);
	}
	res.json({ received: true });
}));

// --- WhatsApp: crear eventos automáticamente a partir de una foto de flyer ---
//
// El tenant se identifica por :slug en la URL (mismo patrón que /public/org/:slug) — cada club
// registra su propia URL de webhook en su App de Meta, así que acá ya sabemos a quién pertenece el
// mensaje antes de leer el body. El evento se PUBLICA directo (active: true), sin pantalla de
// revisión — decisión explícita del club, sabiendo que la IA puede leer mal un precio o una fecha
// (ver los casos reales de esta misma sesión). La única red de seguridad es la respuesta por
// WhatsApp al final con un resumen de lo que se creó, para que el error se note al toque.

// Handshake único al configurar el webhook en el panel de Meta — responde el challenge tal cual si
// el verify_token coincide con el guardado en Settings → WhatsApp.
publicRouter.get('/webhooks/whatsapp/:slug', asyncHandler(async (req, res) => {
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug: req.params.slug } });
	if (!tenant) {
		res.sendStatus(404);
		return;
	}
	const config = await getWhatsAppConfig(tenant.id).catch(() => null);
	const mode = req.query['hub.mode'];
	const token = req.query['hub.verify_token'];
	const challenge = req.query['hub.challenge'];
	if (config?.verifyToken && mode === 'subscribe' && token === config.verifyToken) {
		res.status(200).send(challenge);
		return;
	}
	res.sendStatus(403);
}));

// Adivina a qué mapa/área del club se refiere el flyer por nombre — la IA nunca ve ni inventa un
// mapId real, solo un texto (venueNameGuess) que se resuelve acá contra los mapas que existen de
// verdad. Sin match, cae al primer mapa/área del tenant (mejor una venta con el mapa "por defecto"
// que un evento sin ningún asiento donde vender).
async function resolveWhatsAppVenue(tenantId: number, venueNameGuess: string | null) {
	// orderBy explícito (antes confiaba en el orden implícito de SQLite) para que el fallback "primer
	// mapa del tenant" sea determinístico y no dependa de un detalle de implementación de la DB.
	const maps = await prisma.map.findMany({ where: { tenantId }, include: { areas: true }, orderBy: { id: 'asc' } });
	if (!maps.length) return null;
	const needle = venueNameGuess?.toLowerCase().trim();
	if (needle) {
		for (const map of maps) {
			if (map.name.toLowerCase().includes(needle) || needle.includes(map.name.toLowerCase())) {
				return { mapId: map.id, areaId: map.areas[0]?.id ?? null };
			}
			for (const area of map.areas) {
				if (area.name.toLowerCase().includes(needle) || needle.includes(area.name.toLowerCase())) {
					return { mapId: map.id, areaId: area.id };
				}
			}
		}
	}
	return { mapId: maps[0].id, areaId: maps[0].areas[0]?.id ?? null };
}

publicRouter.post('/webhooks/whatsapp/:slug', asyncHandler(async (req, res) => {
	// Meta espera 200 rápido siempre que se pueda — el procesamiento real sigue después de responder,
	// así que TODO lo que sigue va dentro de un único try/catch que nunca vuelve a tocar `res` ni
	// relanza el error (si algo escapara acá, asyncHandler lo mandaría al middleware de errores, que
	// intentaría mandar una respuesta que ya se envió, y Express tira "headers already sent").
	res.json({ received: true });

	let from: string | undefined;
	let config: Awaited<ReturnType<typeof getWhatsAppConfig>> | null = null;

	try {
		const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug: req.params.slug } });
		if (!tenant) return;

		config = await getWhatsAppConfig(tenant.id).catch((err) => {
			if (err instanceof WhatsAppNotConfiguredError) return null;
			throw err;
		});
		if (!config) return;

		// Falla CERRADO si no hay App Secret cargado — sin esto, cualquiera que descubra la URL del
		// webhook (no es secreta) y un número de la lista de autorizados (tampoco lo es, necesariamente)
		// podría mandar un POST fabricado a mano y crear eventos falsos sin pasar por WhatsApp en
		// absoluto. Antes esto se saltaba en silencio si `appSecret` era null; ahora es obligatorio.
		const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
		const signature = req.headers['x-hub-signature-256'] as string | undefined;
		if (!config.appSecret || !rawBody || !verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
			console.error(`Firma de webhook de WhatsApp inválida o App Secret no configurado para tenant ${tenant.id}`);
			return;
		}

		const value = req.body?.entry?.[0]?.changes?.[0]?.value;
		const message = value?.messages?.[0];
		if (!message) return; // callback de estado (entregado/leído), no un mensaje nuevo

		// Normalizado a solo-dígitos en los dos lados (acá y al guardar "Números autorizados" en
		// Settings) — así "+1 809-627-9180" matchea contra "18096279180" en vez de fallar en silencio
		// por un formato distinto sin ningún aviso de por qué.
		from = (message.from as string | undefined)?.replace(/\D/g, '');
		if (!from) return;
		if (!config.allowedSenders.includes(from)) {
			console.warn(`Mensaje de WhatsApp de un número no autorizado (${from}) para tenant ${tenant.id}, ignorado.`);
			return;
		}

		if (message.type !== 'image') {
			await sendTextMessage(config, from, 'Mandame una foto del flyer del evento y lo cargo automáticamente. 📸');
			return;
		}

		const { buffer, mimeType } = await downloadMedia(message.image.id, config.accessToken);

		// Reenvío accidental de la misma foto (pasó de verdad en pruebas: WhatsApp/el usuario la manda
		// dos veces seguidas) — comparar el hash contra los eventos creados por este canal en los
		// últimos 15 min, en vez de crear un evento duplicado con una fecha adivinada distinta cada vez.
		const imageHash = createHash('sha256').update(buffer).digest('hex');
		const recentEvents = await prisma.event.findMany({
			where: { tenantId: tenant.id, createdAt: { gt: new Date(Date.now() - 15 * 60 * 1000) } },
			select: { id: true, name: true, code: true, img: true },
		});
		for (const ev of recentEvents) {
			if (!ev.img) continue;
			const filePath = path.join(uploadsDir, path.basename(ev.img));
			if (!fs.existsSync(filePath)) continue;
			if (createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') === imageHash) {
				await sendTextMessage(config, from, `Ya había procesado esta misma foto hace un rato: "${ev.name}" (${ev.code}). Si es un evento distinto, mandame una versión editada del flyer.`);
				return;
			}
		}

		const maps = await prisma.map.findMany({ where: { tenantId: tenant.id }, select: { name: true } });
		const extracted = await extractEventFromImage(buffer, mimeType, maps.map((m) => m.name));

		const venue = await resolveWhatsAppVenue(tenant.id, extracted.venueNameGuess);
		if (!venue) {
			await sendTextMessage(config, from, `No pude crear "${extracted.name}" porque este club todavía no tiene ningún mapa configurado en el sistema.`);
			return;
		}

		const dateOn = new Date(extracted.dateOn);
		const duplicate = await findDuplicateEventSlot(tenant.id, venue.mapId, dateOn);
		if (duplicate) {
			await sendTextMessage(
				config,
				from,
				`No cargué "${extracted.name}" (${extracted.dateOn}) porque ya existe "${duplicate.name}" con esa misma fecha y mapa. Si son eventos distintos, cargalo a mano desde el manager.`,
			);
			return;
		}

		// Ninguna sesión está logueada en este flujo — se atribuye al primer usuario administrador del
		// tenant, el mismo que tiene que haber cargado las credenciales de WhatsApp en Settings.
		const adminUser = await prisma.user.findFirst({ where: { tenantId: tenant.id, type: { type: 'ROOT' } } });
		if (!adminUser) {
			await sendTextMessage(config, from, `No pude crear "${extracted.name}" porque no encontré un usuario administrador en este club.`);
			return;
		}

		// Nadie revisó todavía lo que la IA extrajo del flyer (fechas, precios, mapa asignado por
		// nombre) antes de publicarlo — a diferencia de un evento cargado a mano en el manager, acá se
		// programa la publicación 24hs a futuro por default en vez de dejarlo visible al público de
		// inmediato, dándole al encargado una ventana real para revisar y corregir antes de que alguien
		// pueda comprar. Sigue siendo un evento normal: el encargado puede adelantar/quitar esta fecha
		// desde el manager en cualquier momento si quiere publicarlo antes.
		const publishAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

		const img = saveBuffer(buffer, mimeType);
		const created = await prisma.event.create({
			data: {
				name: extracted.name,
				img,
				code: '',
				publicSlug: generatePublicSlug(),
				type: 'Normal',
				description: extracted.description,
				dateSale: new Date(),
				dateOn,
				dateOff: new Date(extracted.dateOff),
				startTime: extracted.startTime,
				mapId: venue.mapId,
				userId: adminUser.id,
				tenantId: tenant.id,
				publishAt,
			},
		});
		// Código legible basado en el id (mismo patrón que POST /events autenticado).
		const event = await prisma.event.update({ where: { id: created.id, tenantId: tenant.id }, data: { code: `EVT-${String(created.id).padStart(4, '0')}` } });

		// Ticket.code también es único y se genera server-side desde el id — createMany no permite un
		// update por fila después, así que van uno por uno (mismo patrón que POST /tickets autenticado).
		for (const t of extracted.tickets) {
			const createdTicket = await prisma.ticket.create({
				data: {
					name: t.name,
					img: '',
					code: '',
					description: '',
					type: 'Normal',
					count: t.count,
					priceCents: t.price,
					eventId: event.id,
					areaId: venue.areaId,
					attendeeType: t.attendeeType,
					tenantId: tenant.id,
				},
			});
			await prisma.ticket.update({ where: { id: createdTicket.id, tenantId: tenant.id }, data: { code: `TCK-${String(createdTicket.id).padStart(4, '0')}` } });
		}

		await logAudit({
			tenantId: tenant.id,
			userId: adminUser.id,
			action: 'CREATE',
			entity: 'Event',
			entityId: event.id,
			summary: `Creó el evento "${event.name}" automáticamente desde una imagen de WhatsApp`,
		});

		const publicUrl = `${req.protocol}://${req.get('host')}/e/${event.publicSlug}`;
		const ticketsSummary = extracted.tickets.map((t) => `• ${t.name}: RD$${t.price} (${t.count} cupos)`).join('\n');
		const publishAtLabel = publishAt.toLocaleString('es-DO', {
			timeZone: 'America/Santo_Domingo',
			day: 'numeric',
			month: 'long',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
		await sendTextMessage(
			config,
			from,
			[
				`✅ Evento creado: ${extracted.name}`,
				`📅 ${extracted.dateOn}${extracted.dateOn !== extracted.dateOff ? ` al ${extracted.dateOff}` : ''}${extracted.startTime ? ` — ${extracted.startTime}` : ''}`,
				ticketsSummary,
				`🔗 ${publicUrl}`,
				'',
				`Se publica solo el ${publishAtLabel} (24hs de margen). Revísalo en el manager antes de esa hora por si algo salió mal (fechas, precios, mapa) — desde ahí también puedes adelantar o quitar esa fecha.`,
			].join('\n'),
		);
	} catch (err) {
		console.error(`Error procesando imagen de WhatsApp (slug ${req.params.slug}):`, err);
		if (config && from) {
			const message =
				err instanceof AnthropicNotConfiguredError || err instanceof AnthropicRequestError
					? 'No pude leer la imagen con IA — prueba de nuevo en un rato.'
					: 'Algo salió mal creando el evento a partir de esa imagen.';
			await sendTextMessage(config, from, `❌ ${message}`).catch(() => {});
		}
	}
}));
