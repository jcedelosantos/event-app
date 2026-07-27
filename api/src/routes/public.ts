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

export const publicRouter = Router();

class InsufficientStockError extends Error {}
class NoMealConfiguredError extends Error {}

const MAX_SEATS_PER_ORDER = 5;

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
