import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { isClubTenant, validateAttendeeRule, MAX_INVITADOS_PER_SOCIO } from '../lib/attendee';

export const publicRouter = Router();

class InsufficientStockError extends Error {}

const MAX_SEATS_PER_ORDER = 5;

// Rutas sin auth: las usa el cliente final desde el link/QR del evento, no tiene cuenta de manager.
// Al ser público y sin autenticación es la superficie más expuesta de toda la API — el wrap con
// asyncHandler acá es todavía más importante que en el resto de las rutas.
//
// El evento se resuelve por `code` (único globalmente) usando `prismaUnscoped` — es el único lookup
// legítimo sin tenantId de todo el backend, porque acá todavía no sabemos a qué tenant pertenece la
// visita. Una vez resuelto el evento, TODO lo demás se filtra por `event.tenantId` con el cliente
// normal (con tenant-guard), así ninguna query subsiguiente puede fugarse a otro tenant.

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
	});
}));

// Chequeo previo del tope de invitados por socio — el picker público lo usa apenas se completa el
// carnet del socio que invita, ANTES de dejar elegir asiento, para no hacer perder tiempo armando
// una selección que después el submit va a rechazar igual (ver validateAttendeeRule, misma regla,
// única fuente de verdad real).
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
		res.json({ used: 0, max: MAX_INVITADOS_PER_SOCIO, blocked: false });
		return;
	}

	const used = await prisma.saleTicket.count({
		where: { eventId: event.id, tenantId: event.tenantId, attendeeType: 'INVITADO', sponsorCarnet: carnet },
	});
	res.json({ used, max: MAX_INVITADOS_PER_SOCIO, blocked: used >= MAX_INVITADOS_PER_SOCIO });
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

const purchaseSchema = z.object({
	eventCode: z.string().min(1),
	ticketId: z.number().int(),
	client: registerSchema,
	seatIds: z.array(z.number().int()).min(1).max(MAX_SEATS_PER_ORDER),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).optional(),
	sponsorCarnet: z.string().optional(),
});

publicRouter.post('/purchase', asyncHandler(async (req, res) => {
	const parsed = purchaseSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds, attendeeType, sponsorCarnet } = parsed.data;

	const event = await prismaUnscoped.event.findUnique({ where: { code: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
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
				username: clientData.email,
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
		const saleTickets = await prisma.$transaction(async (tx) => {
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
			return Promise.all(
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
		});

		const publicSaleTickets = saleTickets.map(({ client: c, seller: s, ...rest }) => ({ ...rest, client: toPublicUser(c), seller: toPublicUser(s) }));

		sendTicketEmail({ to: clientData.email, clientName: clientData.name, event, saleTickets: publicSaleTickets }).catch((err) =>
			console.error('No se pudo enviar el email del ticket:', err),
		);

		res.status(201).json(publicSaleTickets);
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
