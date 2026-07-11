import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';

export const publicRouter = Router();

const MAX_SEATS_PER_ORDER = 5;

// Rutas sin auth: las usa el cliente final desde el link/QR del evento, no tiene cuenta de manager.
// Al ser público y sin autenticación es la superficie más expuesta de toda la API — el wrap con
// asyncHandler acá es todavía más importante que en el resto de las rutas.

publicRouter.get('/events/:code', asyncHandler(async (req, res) => {
	const event = await prisma.event.findUnique({
		where: { code: req.params.code },
		include: {
			map: { include: { areas: { include: { seats: true } } } },
			tickets: { where: { active: true } },
		},
	});
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const soldSeats = await prisma.saleTicket.findMany({ where: { eventId: event.id }, select: { seatId: true } });
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
		tickets: event.tickets,
		map,
	});
}));

const registerSchema = z.object({
	name: z.string().min(1),
	lastname: z.string().min(1),
	email: z.string().email(),
	phone: z.string().min(1),
	carnet: z.string().min(1),
});

publicRouter.post('/register', asyncHandler(async (req, res) => {
	const parsed = registerSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const existing = await prisma.user.findUnique({ where: { email: parsed.data.email }, include: { type: true } });
	if (existing) {
		// Si el cliente ya existía de una compra anterior sin carnet (dato agregado después), completarlo
		// ahora que lo tenemos — no pisar uno que ya esté cargado.
		if (!existing.carnet && parsed.data.carnet) {
			const updated = await prisma.user.update({ where: { id: existing.id }, data: { carnet: parsed.data.carnet }, include: { type: true } });
			res.json(toPublicUser(updated));
			return;
		}
		res.json(toPublicUser(existing));
		return;
	}

	const clientType = await prisma.userType.findFirst({ where: { type: 'CLIENT' } });
	if (!clientType) {
		res.status(500).json({ error: 'No existe el tipo de usuario CLIENT' });
		return;
	}

	try {
		const hashed = await bcrypt.hash(randomUUID(), 10);
		const user = await prisma.user.create({
			data: {
				username: parsed.data.email,
				password: hashed,
				name: parsed.data.name,
				lastname: parsed.data.lastname,
				email: parsed.data.email,
				phone: parsed.data.phone,
				gender: '',
				adress: '',
				carnet: parsed.data.carnet,
				typeId: clientType.id,
			},
			include: { type: true },
		});
		res.status(201).json(toPublicUser(user));
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Ese email ya está registrado' });
			return;
		}
		throw err;
	}
}));

const purchaseSchema = z.object({
	eventCode: z.string().min(1),
	ticketId: z.number().int(),
	client: registerSchema,
	seatIds: z.array(z.number().int()).min(1).max(MAX_SEATS_PER_ORDER),
});

publicRouter.post('/purchase', asyncHandler(async (req, res) => {
	const parsed = purchaseSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventCode, ticketId, client: clientData, seatIds } = parsed.data;

	const event = await prisma.event.findUnique({ where: { code: eventCode } });
	if (!event || !event.active) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, eventId: event.id } });
	if (!ticket) {
		res.status(400).json({ error: 'El ticket elegido no pertenece a este evento' });
		return;
	}

	const alreadySold = await prisma.saleTicket.findMany({ where: { eventId: event.id, seatId: { in: seatIds } } });
	if (alreadySold.length) {
		res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
		return;
	}

	const clientType = await prisma.userType.findFirst({ where: { type: 'CLIENT' } });
	if (!clientType) {
		res.status(500).json({ error: 'No existe el tipo de usuario CLIENT' });
		return;
	}
	let client = await prisma.user.findUnique({ where: { email: clientData.email } });
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
			},
		});
	} else if (!client.carnet && clientData.carnet) {
		// Mismo backfill que en /register — un cliente que ya compró antes sin carnet lo completa acá.
		client = await prisma.user.update({ where: { id: client.id }, data: { carnet: clientData.carnet } });
	}

	// Las compras de autoservicio no tienen un vendedor humano — se registran a nombre del primer
	// usuario ROOT (el admin de la cuenta) para no volver nullable la relación seller en el schema.
	const rootUser = await prisma.user.findFirst({ where: { type: { type: 'ROOT' } } });
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
		const saleTickets = await prisma.$transaction(
			seatIds.map((seatId) =>
				prisma.saleTicket.create({
					data: {
						eventId: event.id,
						seatId,
						ticketId: ticket.id,
						userId: rootUser.id,
						clientId: client!.id,
						paidType: 'Online',
						description: 'Compra autoservicio',
						codeQR: randomUUID(),
					},
					include,
				}),
			),
		);

		const publicSaleTickets = saleTickets.map(({ client: c, seller: s, ...rest }) => ({ ...rest, client: toPublicUser(c), seller: toPublicUser(s) }));

		sendTicketEmail({ to: clientData.email, clientName: clientData.name, event, saleTickets: publicSaleTickets }).catch((err) =>
			console.error('No se pudo enviar el email del ticket:', err),
		);

		res.status(201).json(publicSaleTickets);
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Uno o más asientos elegidos ya no están disponibles. Volvé a intentarlo.' });
			return;
		}
		throw err;
	}
}));
