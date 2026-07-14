import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireLicense } from '../middleware/license';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const saleTicketsRouter = Router();
saleTicketsRouter.use(requireAuth);

class InsufficientStockError extends Error {}

const saleTicketInputSchema = z.object({
	eventId: z.number().int(),
	seatId: z.number().int(),
	ticketId: z.number().int(),
	clientId: z.number().int(),
	paidType: z.string().min(1),
	description: z.string().optional().default(''),
});

export const saleTicketInclude = {
	event: true,
	seat: { include: { area: true } },
	ticket: true,
	client: { include: { type: true } },
	seller: { include: { type: true } },
};
const include = saleTicketInclude;

export function toPublicSaleTicket(saleTicket: any) {
	const { client, seller, ...rest } = saleTicket;
	return { ...rest, client: toPublicUser(client), seller: toPublicUser(seller) };
}

saleTicketsRouter.get('/', asyncHandler(async (req, res) => {
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const saleTickets = await prisma.saleTicket.findMany({ where: eventId ? { eventId } : undefined, include, orderBy: { id: 'desc' } });
	res.json(saleTickets.map(toPublicSaleTicket));
}));

saleTicketsRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id }, include });
	if (!saleTicket) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}
	res.json(toPublicSaleTicket(saleTicket));
}));

saleTicketsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = saleTicketInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const saleTicket = await prisma.$transaction(async (tx) => {
			// Mismo patrón atómico que sale-products.ts: el updateMany con `count: { gte: 1 }` en el
			// where hace el chequeo-y-descuento en una sola operación, así dos ventas simultáneas no
			// pueden llevarse el mismo cupo aunque ambas lean "hay stock" al mismo tiempo.
			const stockUpdate = await tx.ticket.updateMany({
				where: { id: parsed.data.ticketId, count: { gte: 1 } },
				data: { count: { decrement: 1 } },
			});
			if (stockUpdate.count === 0) {
				throw new InsufficientStockError();
			}
			return tx.saleTicket.create({
				data: {
					...parsed.data,
					codeQR: randomUUID(),
					userId: req.user!.userId,
				},
				include,
			});
		});
		res.status(201).json(toPublicSaleTicket(saleTicket));
	} catch (err: any) {
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay stock disponible para este tipo de ticket.' });
			return;
		}
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'Evento, asiento, ticket o cliente inválido' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Ese asiento ya fue vendido para este evento' });
			return;
		}
		throw err;
	}
}));

const bulkImportRowSchema = z.object({
	carnet: z.string().optional().default(''),
	name: z.string().min(1),
	lastname: z.string().optional().default(''),
	email: z.string().optional().default(''),
	phone: z.string().optional().default(''),
	seatName: z.string().min(1),
	paidType: z.string().optional().default('Efectivo'),
});

const bulkImportSchema = z.object({
	eventId: z.number().int(),
	ticketId: z.number().int(),
	rows: z.array(bulkImportRowSchema).min(1).max(1000),
});

// "N/S" (sin carnet) es el valor real que usa el club para invitados que no son socios — no cuenta
// como identificador.
function hasRealCarnet(carnet: string): boolean {
	return carnet.trim() !== '' && carnet.trim().toUpperCase() !== 'N/S';
}

// Carga masiva de un CSV de ventas (carnet, nombre, mesa/silla ya vendidos en otro sistema o en
// papel) contra UN evento — crea o reutiliza el cliente y le asigna el asiento indicado por nombre.
// Igual que el bulk-import de productos: cada fila en su propio try/catch, nunca una sola transacción
// para todo el lote, porque un CSV real de gente tiene errores humanos (carnet repetido, asiento que
// no existe, etc.) y hace falta un reporte de qué entró y qué no, no un 400 que descarta todo.
saleTicketsRouter.post('/bulk-import', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = bulkImportSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventId, ticketId, rows } = parsed.data;

	const event = await prisma.event.findUnique({ where: { id: eventId }, include: { map: { include: { areas: { include: { seats: true } } } } } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, eventId } });
	if (!ticket) {
		res.status(400).json({ error: 'El ticket elegido no pertenece a este evento' });
		return;
	}
	const clientType = await prisma.userType.findFirst({ where: { type: 'CLIENT' } });
	if (!clientType) {
		res.status(500).json({ error: 'No existe el tipo de usuario CLIENT' });
		return;
	}

	const seatIdByName = new Map<string, number>();
	for (const area of event.map?.areas ?? []) {
		for (const seat of area.seats) seatIdByName.set(seat.name, seat.id);
	}

	let created = 0;
	const skipped: { row: number; reason: string }[] = [];

	for (const [i, row] of rows.entries()) {
		const rowNum = i + 1;
		const seatId = seatIdByName.get(row.seatName);
		if (!seatId) {
			skipped.push({ row: rowNum, reason: `El asiento "${row.seatName}" no existe en el mapa de este evento` });
			continue;
		}
		const alreadySold = await prisma.saleTicket.findFirst({ where: { eventId, seatId } });
		if (alreadySold) {
			skipped.push({ row: rowNum, reason: `El asiento "${row.seatName}" ya estaba vendido` });
			continue;
		}

		try {
			let client = hasRealCarnet(row.carnet) ? await prisma.user.findFirst({ where: { carnet: row.carnet } }) : null;
			if (!client && row.email) {
				client = await prisma.user.findUnique({ where: { email: row.email } });
			}
			if (!client) {
				// Sin carnet ni correo (invitados) no hay forma de deduplicar — se genera un email
				// placeholder único ligado al asiento para que el registro sea válido en el schema
				// (email es @unique y obligatorio) sin bloquear la importación por eso.
				const email = row.email || `invitado.asiento-${seatId}.evento-${eventId}@sin-correo.local`;
				const hashed = await bcrypt.hash(randomUUID(), 10);
				client = await prisma.user.create({
					data: {
						username: email,
						password: hashed,
						name: row.name,
						lastname: row.lastname,
						email,
						phone: row.phone || 'N/A',
						gender: '',
						adress: '',
						carnet: hasRealCarnet(row.carnet) ? row.carnet : '',
						typeId: clientType.id,
					},
				});
			}

			// Mismo chequeo-y-descuento atómico que la venta individual — una fila del CSV que se
			// quede sin stock se reporta como omitida en vez de crear una venta sin cupo real detrás.
			await prisma.$transaction(async (tx) => {
				const stockUpdate = await tx.ticket.updateMany({
					where: { id: ticketId, count: { gte: 1 } },
					data: { count: { decrement: 1 } },
				});
				if (stockUpdate.count === 0) {
					throw new InsufficientStockError();
				}
				return tx.saleTicket.create({
					data: {
						eventId,
						seatId,
						ticketId,
						userId: req.user!.userId,
						clientId: client.id,
						paidType: row.paidType,
						description: 'Importación masiva',
						codeQR: randomUUID(),
					},
				});
			});
			created++;
		} catch (err) {
			if (err instanceof InsufficientStockError) {
				skipped.push({ row: rowNum, reason: 'Sin stock disponible para este tipo de ticket' });
				continue;
			}
			skipped.push({ row: rowNum, reason: `No se pudo procesar a "${row.name}" (${row.seatName})` });
		}
	}

	res.json({ created, skipped });
}));

saleTicketsRouter.post('/:id/resend', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id }, include });
	if (!saleTicket) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}

	try {
		await sendTicketEmail({
			to: saleTicket.client.email,
			clientName: saleTicket.client.name,
			event: saleTicket.event,
			saleTickets: [saleTicket],
		});
		res.json({ ok: true });
	} catch (err) {
		console.error('No se pudo reenviar el email del ticket:', err);
		res.status(500).json({ error: 'No se pudo enviar el correo. Revisá la configuración de email.' });
	}
}));

// El check-in por QR se hace vía el endpoint unificado POST /scan (ver scan.ts), que también
// cubre la entrega de productos con el mismo lector.

// Borrar la venta libera el asiento (la disponibilidad se calcula por ausencia de SaleTicket) — por
// eso esta acción requiere el permiso RELEASE_SEAT en vez de quedar abierta a cualquier manager
// autenticado.
saleTicketsRouter.delete('/:id', requireLicense('RELEASE_SEAT'), asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	try {
		// Igual que sale-products.ts: liberar un asiento también devuelve el cupo al stock del
		// ticket, si no cada corrección/liberación termina "perdiendo" cupo real.
		const saleTicket = await prisma.$transaction(async (tx) => {
			const sale = await tx.saleTicket.delete({ where: { id } });
			await tx.ticket.update({ where: { id: sale.ticketId }, data: { count: { increment: 1 } } });
			return sale;
		});
		await logAudit({
			userId: req.user!.userId,
			action: 'DELETE',
			entity: 'SaleTicket',
			entityId: id,
			summary: `Liberó el asiento de la venta #${id} (código ${saleTicket.codeQR}, stock restaurado)`,
		});
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Venta no encontrada' });
			return;
		}
		throw err;
	}
}));
