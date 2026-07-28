import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { isClubTenant, validateAttendeeRule, normalizeCarnet, MAX_INVITADOS_PER_SOCIO } from '../lib/attendee';
import { uniqueUsername } from '../lib/unique-username';
import { resolveFamilyCodeQR } from '../lib/family-code';
import { checkDuplicateEventRegistration } from '../lib/duplicate-event-guard';
import { createOrder as createPaypalOrder, captureOrder as capturePaypalOrder, verifyWebhookSignature, PayPalNotConfiguredError, PayPalRequestError } from '../lib/paypal';
import { finalizePaidSaleTickets } from '../lib/checkout';
import { findDuplicateEventSlot } from '../lib/find-duplicate-event-slot';
import { extractEventFromImage, AnthropicNotConfiguredError, AnthropicRequestError } from '../lib/event-extraction';
import { getTenantConfig as getWhatsAppConfig, verifySignature as verifyWhatsAppSignature, downloadMedia, sendTextMessage, WhatsAppNotConfiguredError } from '../lib/whatsapp';
import { saveBuffer } from '../lib/uploads';
import { logAudit } from '../lib/audit';

export const publicRouter = Router();

class InsufficientStockError extends Error {}
class NoMealConfiguredError extends Error {}

const MAX_SEATS_PER_ORDER = 5;
// Tiempo que un asiento queda "apartado" (SaleTicket en PENDING) mientras el comprador paga —
// vencido esto, el próximo intento de reservar ESE asiento lo libera solo (ver releaseExpiredHolds),
// sin necesitar un cron aparte.
const HOLD_MINUTES = 15;

// Libera asientos cuyo hold (SaleTicket PENDING) ya venció, devolviendo el cupo al stock del
// ticket — se llama al principio de /checkout/hold, ANTES de chequear disponibilidad, así un
// comprador que abandonó el pago no deja el asiento bloqueado para siempre.
async function releaseExpiredHolds(tenantId: number, eventId: number, seatIds: number[]) {
	const expired = await prisma.saleTicket.findMany({
		where: { eventId, seatId: { in: seatIds }, tenantId, paymentStatus: 'PENDING', paymentExpiresAt: { lt: new Date() } },
	});
	if (!expired.length) return;
	await prisma.$transaction([
		...expired.map((s) => prisma.ticket.update({ where: { id: s.ticketId, tenantId }, data: { count: { increment: 1 } } })),
		prisma.saleTicket.deleteMany({ where: { id: { in: expired.map((s) => s.id) }, tenantId } }),
	]);
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

	const events = await prisma.event.findMany({
		where: { tenantId: tenant.id, active: true, dateOff: { gte: new Date() } },
		orderBy: { dateOn: 'asc' },
		select: {
			id: true,
			name: true,
			code: true,
			img: true,
			description: true,
			dateOn: true,
			dateOff: true,
			startTime: true,
			map: { select: { name: true } },
			tickets: { where: { active: true }, select: { count: true } },
		},
	});

	res.json({
		name: tenant.name,
		slug: tenant.slug,
		type: tenant.type,
		// soldOut/inactive se calculan acá para no exponer tickets/precios en este listado público — la
		// portada solo necesita saber si puede o no llevar al comprador a /e/:code, y con qué etiqueta.
		// Son casos distintos: "inactive" es un evento a futuro que el manager todavía no terminó de
		// configurar (sin tickets cargados) — "soldOut" es uno real que ya se vendió por completo. Antes
		// ambos mostraban "Agotado" por igual, dando a entender que hubo entradas cuando en realidad
		// nunca se llegaron a cargar.
		events: events.map(({ tickets, ...event }) => ({
			...event,
			inactive: !tickets.length,
			soldOut: tickets.length > 0 && tickets.every((t) => t.count <= 0),
		})),
	});
}));

publicRouter.get('/events/:code', asyncHandler(async (req, res) => {
	const event = await prismaUnscoped.event.findUnique({
		where: { code: req.params.code },
		include: {
			map: { include: { areas: { include: { seats: true, tables: true } } } },
			tickets: { where: { active: true } },
			tenant: { select: { type: true } },
		},
	});
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const soldSeats = await prisma.saleTicket.findMany({ where: { eventId: event.id, tenantId: event.tenantId }, select: { seatId: true } });
	const soldSeatIds = new Set(soldSeats.map((s) => s.seatId));

	const mealProduct = await prisma.product.findFirst({ where: { eventId: event.id, tenantId: event.tenantId, isMealOfTheDay: true }, select: { id: true } });

	// Solo se arman a mano estas 3 keys puntuales (nunca un dump de AppSetting) — así el secret de
	// PayPal (payments.paypalSecret) jamás puede llegar a este endpoint público, sin depender de que
	// el filtro de GET /settings se mantenga correcto para siempre (ver settings.ts).
	let payment: { mode: string; paypalClientId: string | null; linkUrl: string | null } | null = null;
	if (event.paymentMode !== 'NONE') {
		const paymentSettings = await prisma.appSetting.findMany({
			where: { tenantId: event.tenantId, key: { in: ['payments.paypalClientId', 'payments.linkUrl'] } },
		});
		const settingsMap = Object.fromEntries(paymentSettings.map((s) => [s.key, s.value]));
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
		tickets: event.tickets,
		map,
		// El picker público lo usa para saber si tiene que pedir socio/invitado + carnet — ver
		// lib/attendee.ts. Solo importa el tipo, no se expone nada más del tenant acá.
		tenantType: event.tenant?.type ?? 'GENERAL',
		hasMealOfTheDay: !!mealProduct,
		payment,
	});
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

	const event = await prismaUnscoped.event.findUnique({ where: { code: req.params.code }, select: { id: true, tenantId: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	if (!(await isClubTenant(event.tenantId))) {
		res.json({ registered: true, used: 0, max: MAX_INVITADOS_PER_SOCIO, blocked: false });
		return;
	}

	// Mismo criterio que validateAttendeeRule: el carnet se compara normalizado (case/espacios), no
	// con `equals` de Prisma, para que "C6735" y "c6735" cuenten como el mismo socio.
	const normalizedCarnet = normalizeCarnet(carnet);
	const socioSales = await prisma.saleTicket.findMany({
		where: { eventId: event.id, tenantId: event.tenantId, attendeeType: 'SOCIO' },
		select: { client: { select: { carnet: true } } },
	});
	const sponsorRegistered = socioSales.some((s) => normalizeCarnet(s.client.carnet ?? '') === normalizedCarnet);
	const invitadoSales = await prisma.saleTicket.findMany({
		where: { eventId: event.id, tenantId: event.tenantId, attendeeType: 'INVITADO' },
		select: { sponsorCarnet: true },
	});
	const used = invitadoSales.filter((s) => normalizeCarnet(s.sponsorCarnet ?? '') === normalizedCarnet).length;
	res.json({
		registered: !!sponsorRegistered,
		used,
		max: MAX_INVITADOS_PER_SOCIO,
		blocked: !sponsorRegistered || used >= MAX_INVITADOS_PER_SOCIO,
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

	const event = await prismaUnscoped.event.findUnique({ where: { code: req.params.code }, select: { id: true, tenantId: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	if (!(await isClubTenant(event.tenantId))) {
		res.json({ blocked: false, reason: null });
		return;
	}

	const reason = await checkDuplicateEventRegistration({ tenantId: event.tenantId, eventId: event.id, clientEmail: email, clientCarnet: carnet });
	res.json({ blocked: !!reason, reason });
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

const purchaseSchema = z.object({
	eventCode: z.string().min(1),
	ticketId: z.number().int(),
	client: registerSchema,
	seatIds: z.array(z.number().int()).min(1).max(MAX_SEATS_PER_ORDER),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).optional(),
	sponsorCarnet: z.string().optional(),
	children: z.array(childInputSchema).optional().default([]),
});

publicRouter.post('/purchase', asyncHandler(async (req, res) => {
	const parsed = purchaseSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds, attendeeType, sponsorCarnet, children } = parsed.data;

	const event = await prismaUnscoped.event.findUnique({ where: { code: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	// Repite acá el mismo gate que ya aplica el frontend (ver public-event.component.ts) — sin esto,
	// alguien podría comprar igual pegándole directo a este endpoint, sin pasar por la UI. Ojo: NO se
	// chequea dateSale acá — hoy siempre es igual a dateOn (nadie lo edita, la UI no lo expone), así
	// que tratarlo como "inicio de venta" bloquearía la compra de eventos vigentes hasta el mismo día
	// del evento. Si en el futuro se expone dateSale como campo editable, sumar ese chequeo acá.
	if (event.dateOff < new Date()) {
		res.status(409).json({ error: 'Las ventas para este evento ya cerraron.' });
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
		res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
		return;
	}

	if (await isClubTenant(tenantId)) {
		const attendeeError = await validateAttendeeRule({
			tenantId,
			eventId: event.id,
			attendeeType,
			sponsorCarnet,
			clientCarnet: clientData.carnet,
			newInviteCount: seatIds.length,
		});
		if (attendeeError) {
			res.status(400).json({ error: attendeeError });
			return;
		}

		const duplicateError = await checkDuplicateEventRegistration({
			tenantId,
			eventId: event.id,
			clientEmail: clientData.email,
			clientCarnet: clientData.carnet,
		});
		if (duplicateError) {
			res.status(409).json({ error: duplicateError });
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
		const { saleTickets, createdChildren } = await prisma.$transaction(async (tx) => {
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
			const saleTickets = await Promise.all(
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
						},
						include,
					}),
				),
			);

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
	} catch (err: any) {
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay suficiente stock disponible para este tipo de ticket.' });
			return;
		}
		if (err instanceof NoMealConfiguredError) {
			res.status(400).json({ error: 'Este evento no tiene una comida del día configurada.' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
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

publicRouter.post('/checkout/hold', asyncHandler(async (req, res) => {
	const parsed = checkoutHoldSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds, attendeeType, sponsorCarnet, provider } = parsed.data;

	const event = await prismaUnscoped.event.findUnique({ where: { code: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	if (event.paymentMode === 'NONE' || (provider === 'PAYPAL' && event.paymentMode === 'LINK') || (provider === 'LINK' && event.paymentMode === 'PAYPAL')) {
		res.status(400).json({ error: 'Este evento no acepta ese método de pago.' });
		return;
	}
	if (event.dateOff < new Date()) {
		res.status(409).json({ error: 'Las ventas para este evento ya cerraron.' });
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
		res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
		return;
	}

	if (await isClubTenant(tenantId)) {
		const attendeeError = await validateAttendeeRule({
			tenantId,
			eventId: event.id,
			attendeeType,
			sponsorCarnet,
			clientCarnet: clientData.carnet,
			newInviteCount: seatIds.length,
		});
		if (attendeeError) {
			res.status(400).json({ error: attendeeError });
			return;
		}

		const duplicateError = await checkDuplicateEventRegistration({
			tenantId,
			eventId: event.id,
			clientEmail: clientData.email,
			clientCarnet: clientData.carnet,
		});
		if (duplicateError) {
			res.status(409).json({ error: duplicateError });
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
		const saleTickets = await prisma.$transaction(async (tx) => {
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
							...(attendeeType ? { attendeeType, sponsorCarnet: attendeeType === 'INVITADO' ? sponsorCarnet?.trim() : null } : {}),
						},
					}),
				),
			);
		});

		res.status(201).json({
			holdIds: saleTickets.map((s) => s.id),
			totalUSD: ticket.price * seatIds.length,
			expiresAt,
		});
	} catch (err: any) {
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay suficiente stock disponible para este tipo de ticket.' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
			return;
		}
		throw err;
	}
}));

const paypalOrderSchema = z.object({ holdIds: z.array(z.number().int()).min(1) });

publicRouter.post('/checkout/paypal/order', asyncHandler(async (req, res) => {
	const parsed = paypalOrderSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const holds = await prismaUnscoped.saleTicket.findMany({ where: { id: { in: parsed.data.holdIds } }, include: { ticket: true } });
	if (!holds.length || holds.some((h) => h.paymentStatus !== 'PENDING' || h.paymentProvider !== 'PAYPAL')) {
		res.status(409).json({ error: 'Esta reserva ya no es válida — volvé a elegir tu asiento.' });
		return;
	}
	if (holds.some((h) => !h.paymentExpiresAt || h.paymentExpiresAt < new Date())) {
		res.status(409).json({ error: 'El tiempo para pagar esta reserva venció — volvé a elegir tu asiento.' });
		return;
	}

	const tenantId = holds[0].tenantId;
	const totalUSD = holds.reduce((sum, h) => sum + h.ticket.price, 0);

	try {
		const { orderId } = await createPaypalOrder(tenantId, totalUSD, holds.map((h) => h.id).join(','));
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

publicRouter.post('/checkout/paypal/capture', asyncHandler(async (req, res) => {
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
			res.status(409).json({ error: 'PayPal todavía no confirmó el pago — esperá un momento y volvé a intentar.' });
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
	const maps = await prisma.map.findMany({ where: { tenantId }, include: { areas: true } });
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

		if (config.appSecret) {
			const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
			const signature = req.headers['x-hub-signature-256'] as string | undefined;
			if (!rawBody || !verifyWhatsAppSignature(rawBody, signature, config.appSecret)) {
				console.error(`Firma de webhook de WhatsApp inválida para tenant ${tenant.id}`);
				return;
			}
		}

		const value = req.body?.entry?.[0]?.changes?.[0]?.value;
		const message = value?.messages?.[0];
		if (!message) return; // callback de estado (entregado/leído), no un mensaje nuevo

		from = message.from as string | undefined;
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

		const img = saveBuffer(buffer, mimeType);
		const created = await prisma.event.create({
			data: {
				name: extracted.name,
				img,
				code: '',
				type: 'Normal',
				description: extracted.description,
				dateSale: new Date(),
				dateOn,
				dateOff: new Date(extracted.dateOff),
				startTime: extracted.startTime,
				mapId: venue.mapId,
				userId: adminUser.id,
				tenantId: tenant.id,
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
					price: t.price,
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

		const publicUrl = `${req.protocol}://${req.get('host')}/e/${event.code}`;
		const ticketsSummary = extracted.tickets.map((t) => `• ${t.name}: RD$${t.price} (${t.count} cupos)`).join('\n');
		await sendTextMessage(
			config,
			from,
			[
				`✅ Evento creado: ${extracted.name}`,
				`📅 ${extracted.dateOn}${extracted.dateOn !== extracted.dateOff ? ` al ${extracted.dateOff}` : ''}${extracted.startTime ? ` — ${extracted.startTime}` : ''}`,
				ticketsSummary,
				`🔗 ${publicUrl}`,
				'',
				'Ya está publicado. Revisalo en el manager por si algo salió mal (fechas, precios, mapa).',
			].join('\n'),
		);
	} catch (err) {
		console.error(`Error procesando imagen de WhatsApp (slug ${req.params.slug}):`, err);
		if (config && from) {
			const message =
				err instanceof AnthropicNotConfiguredError || err instanceof AnthropicRequestError
					? 'No pude leer la imagen con IA — probá de nuevo en un rato.'
					: 'Algo salió mal creando el evento a partir de esa imagen.';
			await sendTextMessage(config, from, `❌ ${message}`).catch(() => {});
		}
	}
}));
