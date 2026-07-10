import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { toPublicUser } from '../lib/serialize';

export const saleTicketsRouter = Router();
saleTicketsRouter.use(requireAuth);

const saleTicketInputSchema = z.object({
	eventId: z.number().int(),
	seatId: z.number().int(),
	ticketId: z.number().int(),
	clientId: z.number().int(),
	paidType: z.string().min(1),
	description: z.string().optional().default(''),
});

const include = {
	event: true,
	seat: { include: { area: true } },
	ticket: true,
	client: { include: { type: true } },
	seller: { include: { type: true } },
};

function toPublicSaleTicket(saleTicket: any) {
	const { client, seller, ...rest } = saleTicket;
	return { ...rest, client: toPublicUser(client), seller: toPublicUser(seller) };
}

saleTicketsRouter.get('/', async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const saleTickets = await prisma.saleTicket.findMany({ where: eventId ? { eventId } : undefined, include, orderBy: { id: 'desc' } });
	res.json(saleTickets.map(toPublicSaleTicket));
});

saleTicketsRouter.get('/:id', async (req, res) => {
	const id = Number(req.params.id);
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id }, include });
	if (!saleTicket) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}
	res.json(toPublicSaleTicket(saleTicket));
});

saleTicketsRouter.post('/', async (req: AuthenticatedRequest, res) => {
	const parsed = saleTicketInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const saleTicket = await prisma.saleTicket.create({
			data: {
				...parsed.data,
				codeQR: randomUUID(),
				userId: req.user!.userId,
			},
			include,
		});
		res.status(201).json(toPublicSaleTicket(saleTicket));
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'Evento, asiento, ticket o cliente inválido' });
			return;
		}
		throw err;
	}
});

saleTicketsRouter.delete('/:id', async (req, res) => {
	const id = Number(req.params.id);
	try {
		await prisma.saleTicket.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Venta no encontrada' });
			return;
		}
		throw err;
	}
});
