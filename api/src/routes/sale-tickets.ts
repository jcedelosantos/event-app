import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { hasLicense } from '../middleware/license';
import { toPublicUser } from '../lib/serialize';
import { sendTicketEmail } from '../lib/mail';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';
import { isClubTenant, validateAttendeeRule } from '../lib/attendee';
import { checkDuplicateEventRegistration } from '../lib/duplicate-event-guard';
import { validateHostGuestRule } from '../lib/host-guest';
import { uniqueUsername } from '../lib/unique-username';
import { finalizePaidSaleTickets } from '../lib/checkout';
import { assertEventCapacity } from '../lib/capacity';
import { serializableTransaction } from '../lib/serializable-tx';
import { notifyIfOverageJustCrossed } from '../lib/overage';
import { locationScope } from '../lib/location-scope';

export const saleTicketsRouter = Router();
saleTicketsRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

class InsufficientStockError extends Error {}
class CapacityExceededError extends Error {}
class AttendeeRuleError extends Error {}
class DuplicateRegistrationError extends Error {}
class HostGuestRuleError extends Error {}

// Tope defensivo para la vista "todos los eventos" del panel de QRs (sin eventId, ver
// qr.service.ts getQRs()) — un club activo por años puede acumular miles de ventas, y sin esto
// esa vista pediría TODO el historial de una sola vez cada vez que alguien la abre. Mismo patrón
// que ya usa audit-logs.ts. Filtrado por un eventId puntual queda sin tope: el volumen de un solo
// evento está naturalmente acotado por su aforo, nunca llega a ser un problema.
const ALL_EVENTS_LIST_LIMIT = 500;

const saleTicketInputSchema = z.object({
	eventId: z.number().int(),
	seatId: z.number().int(),
	ticketId: z.number().int(),
	clientId: z.number().int(),
	paidType: z.string().min(1),
	description: z.string().optional().default(''),
	attendeeType: z.enum(['SOCIO', 'INVITADO']).optional(),
	sponsorCarnet: z.string().optional(),
	isHostGuest: z.boolean().optional().default(false),
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

// Shape liviana SOLO para la lista (GET /) — medido en load-tests/results/2026-08-09-dashboard-
// polling.md: el include completo (seller entero + event/ticket/seat repetidos completos por fila)
// pesaba 7.4MB para un evento de 3000 tickets, más de lo que conviene bajarle a un teléfono en la
// puerta de un evento con wifi/datos débiles. Recortado a los campos que realmente lee el frontend
// (grep exhaustivo contra qrs/event-details/dash-board antes de tocar esto — `seller` no se lee en
// ningún lado hoy, `client.email` sí, lo usa el modal de detalle que recibe la fila tal cual sin
// volver a pedirla). NO se toca `saleTicketInclude`/`toPublicSaleTicket` de arriba — los sigue
// usando scan.ts y el resto de los endpoints de este archivo (POST/PUT/GET :id), volumen bajo, sin
// motivo para arriesgar ese contrato.
const listInclude = {
	event: { select: { id: true, name: true } },
	seat: { select: { name: true, area: { select: { name: true } } } },
	ticket: { select: { name: true, priceCents: true } },
	client: { select: { id: true, name: true, lastname: true, carnet: true, email: true } },
};

saleTicketsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	// ?recent=1 es opt-in a propósito: dashboard/event-details dependen de traer el historial
	// COMPLETO sin eventId (calculan ingresos totales sumando en el cliente) — capar el default acá
	// rompería esos números en silencio para cualquier tenant con más de ALL_EVENTS_LIST_LIMIT
	// ventas. Solo la tabla "todos los eventos" del panel de QRs (que sí es navegable/paginable, no
	// un total) pide explícitamente la vista acotada.
	const recent = !eventId && req.query.recent === '1';
	// SaleTicket no tiene locationId propio (ver location-scope.ts) — el filtro de sede pasa por un
	// join al evento vendido.
	const locationFilter = locationScope(req.user!);
	const where = {
		tenantId,
		...(eventId ? { eventId } : {}),
		...(locationFilter.locationId != null ? { event: { locationId: locationFilter.locationId } } : {}),
	};
	const [saleTickets, totalCount] = await Promise.all([
		prisma.saleTicket.findMany({ where, include: listInclude, orderBy: { id: 'desc' }, take: recent ? ALL_EVENTS_LIST_LIMIT : undefined }),
		recent ? prisma.saleTicket.count({ where }) : Promise.resolve(null),
	]);
	if (totalCount != null) res.setHeader('X-Total-Count', String(totalCount));
	// Sin toPublicSaleTicket acá a propósito: listInclude ya seleccionó explícitamente solo campos
	// seguros de client (nunca password/type/tenant) y no trae seller — no hay nada que redactar, y
	// toPublicUser() reventaría igual porque espera `type` presente en el objeto.
	res.json(saleTickets);
}));

saleTicketsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id, tenantId }, include });
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

	const tenantId = req.user!.tenantId!;

	// `User` no está en el tenant-guard (ver lib/tenant-guard.ts — login/superadmin necesitan
	// buscarlo sin tenantId conocido), así que un clientId ajeno a este tenant NO lo bloquea la red de
	// seguridad genérica — hay que validarlo acá a mano antes de usarlo para nada.
	const client = await prisma.user.findFirst({ where: { id: parsed.data.clientId, tenantId } });
	if (!client) {
		res.status(400).json({ error: 'Cliente inválido' });
		return;
	}

	// Solo para leer el tope de aforo/invitados configurado (ver schema.prisma) — si el evento no
	// existe, se deja pasar sin tope acá, el create de más abajo igual va a fallar con P2003.
	const eventCaps = await prisma.event.findFirst({ where: { id: parsed.data.eventId, tenantId }, select: { maxCapacity: true, maxGuestsPerSponsor: true } });

	const isClub = await isClubTenant(tenantId);
	// Un club normalmente vende por socio/invitado, pero un ticket cargado desde un flyer por
	// WhatsApp puede venir sin esa clasificación (ej. tickets por edad) — la regla socio/invitado
	// solo tiene sentido si ESTE ticket puntual participa de ese modelo (mismo criterio que
	// public-event.component.ts, eventUsesAttendeeTypeTickets). Esta lectura en sí no decide cupo,
	// así que puede quedar afuera de la transacción — lo que sí importa (contar invitados/registros
	// existentes) se valida más abajo, DENTRO de la transacción serializable. priceCents viaja acá
	// para congelarlo en la venta (ver SaleTicket.priceCents) — el precio ACTUAL en el momento de
	// vender, no el que el ticket tenga después si alguien lo edita.
	const ticketForAttendeeCheck = await prisma.ticket.findFirst({ where: { id: parsed.data.ticketId, tenantId }, select: { attendeeType: true, priceCents: true } });

	try {
		const saleTicket = await serializableTransaction(async (tx) => {
			if (isClub && ticketForAttendeeCheck?.attendeeType != null) {
				const attendeeError = await validateAttendeeRule(tx, {
					tenantId,
					eventId: parsed.data.eventId,
					attendeeType: parsed.data.attendeeType,
					sponsorCarnet: parsed.data.sponsorCarnet,
					clientCarnet: client?.carnet,
					maxGuestsOverride: eventCaps?.maxGuestsPerSponsor,
				});
				if (attendeeError) throw new AttendeeRuleError(attendeeError);
			}

			if (isClub) {
				const duplicateError = await checkDuplicateEventRegistration(tx, {
					tenantId,
					eventId: parsed.data.eventId,
					clientEmail: client?.email ?? '',
					clientCarnet: client?.carnet,
				});
				if (duplicateError) throw new DuplicateRegistrationError(duplicateError);
			}

			const hostGuestError = await validateHostGuestRule(tx, { tenantId, eventId: parsed.data.eventId, isHostGuest: parsed.data.isHostGuest });
			if (hostGuestError) throw new HostGuestRuleError(hostGuestError);

			const capacityError = await assertEventCapacity(tx, { eventId: parsed.data.eventId, tenantId, maxCapacity: eventCaps?.maxCapacity ?? null, requestedSeats: 1 });
			if (capacityError) {
				throw new CapacityExceededError(capacityError);
			}
			// Mismo patrón atómico que sale-products.ts: el updateMany con `count: { gte: 1 }` en el
			// where hace el chequeo-y-descuento en una sola operación, así dos ventas simultáneas no
			// pueden llevarse el mismo cupo aunque ambas lean "hay stock" al mismo tiempo.
			const stockUpdate = await tx.ticket.updateMany({
				where: { id: parsed.data.ticketId, count: { gte: 1 }, tenantId },
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
					tenantId,
					priceCents: ticketForAttendeeCheck?.priceCents,
				},
				include,
			});
		});
		res.status(201).json(toPublicSaleTicket(saleTicket));
		notifyIfOverageJustCrossed(tenantId, parsed.data.eventId, 1).catch((err) => console.error('No se pudo verificar aforo:', err));
	} catch (err: any) {
		if (err instanceof CapacityExceededError) {
			res.status(409).json({ error: err.message });
			return;
		}
		if (err instanceof InsufficientStockError) {
			res.status(409).json({ error: 'No hay stock disponible para este tipo de ticket.' });
			return;
		}
		if (err instanceof AttendeeRuleError) {
			res.status(400).json({ error: err.message });
			return;
		}
		if (err instanceof DuplicateRegistrationError) {
			res.status(409).json({ error: err.message });
			return;
		}
		if (err instanceof HostGuestRuleError) {
			res.status(400).json({ error: err.message });
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
	const tenantId = req.user!.tenantId!;
	const parsed = bulkImportSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { eventId, ticketId, rows } = parsed.data;

	const event = await prisma.event.findUnique({ where: { id: eventId, tenantId }, include: { map: { include: { areas: { include: { seats: true } } } } } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, eventId, tenantId } });
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

	// Hasheado UNA sola vez fuera del loop, no por fila — esta contraseña es un placeholder random
	// que nadie va a usar para loguearse (los "invitado.*" no tienen una contraseña real comunicada a
	// nadie), así que reusar el mismo hash entre todos los clientes placeholder de este lote no baja
	// la seguridad en nada, y ahorra 10 rondas de bcrypt por fila en un CSV de 1000 filas.
	const placeholderPasswordHash = await bcrypt.hash(randomUUID(), 10);

	let created = 0;
	const skipped: { row: number; reason: string }[] = [];

	for (const [i, row] of rows.entries()) {
		const rowNum = i + 1;
		const seatId = seatIdByName.get(row.seatName);
		if (!seatId) {
			skipped.push({ row: rowNum, reason: `El asiento "${row.seatName}" no existe en el mapa de este evento` });
			continue;
		}
		const alreadySold = await prisma.saleTicket.findFirst({ where: { eventId, seatId, tenantId } });
		if (alreadySold) {
			skipped.push({ row: rowNum, reason: `El asiento "${row.seatName}" ya estaba vendido` });
			continue;
		}

		try {
			let client = hasRealCarnet(row.carnet) ? await prisma.user.findFirst({ where: { carnet: row.carnet, tenantId } }) : null;
			if (!client && row.email) {
				client = await prisma.user.findFirst({ where: { email: row.email, tenantId } });
			}
			if (!client) {
				// Sin carnet ni correo (invitados) no hay forma de deduplicar — se genera un email
				// placeholder único ligado al asiento para que el registro sea válido en el schema
				// (email es obligatorio, aunque ya no @unique global) sin bloquear la importación.
				const email = row.email || `invitado.asiento-${seatId}.evento-${eventId}@sin-correo.local`;
				client = await prisma.user.create({
					data: {
						username: await uniqueUsername(prisma, email),
						password: placeholderPasswordHash,
						name: row.name,
						lastname: row.lastname,
						email,
						phone: row.phone || 'N/A',
						gender: '',
						adress: '',
						carnet: hasRealCarnet(row.carnet) ? row.carnet : '',
						typeId: clientType.id,
						tenantId,
					},
				});
			}

			// Mismo chequeo-y-descuento atómico que la venta individual — una fila del CSV que se
			// quede sin stock se reporta como omitida en vez de crear una venta sin cupo real detrás.
			await prisma.$transaction(async (tx) => {
				const stockUpdate = await tx.ticket.updateMany({
					where: { id: ticketId, count: { gte: 1 }, tenantId },
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
						clientId: client!.id,
						paidType: row.paidType,
						description: 'Importación masiva',
						codeQR: randomUUID(),
						tenantId,
						priceCents: ticket.priceCents,
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
	if (created > 0) {
		notifyIfOverageJustCrossed(tenantId, eventId, created).catch((err) => console.error('No se pudo verificar aforo:', err));
	}
}));

saleTicketsRouter.post('/:id/resend', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id, tenantId }, include });
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

// El check-in normal es por QR vía el endpoint unificado POST /scan (ver scan.ts), que también
// cubre la entrega de productos con el mismo lector — esta ruta es la corrección manual desde el
// panel (marcar/desmarcar "Ingresó" sin escanear, ej. si el asistente ya entró sin QR o el scanner
// no anda) y solo toca checkedInAt, nada más del registro.
saleTicketsRouter.put('/:id/check-in', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const checkedIn = req.body?.checkedIn;
	if (typeof checkedIn !== 'boolean') {
		res.status(400).json({ error: 'checkedIn debe ser true o false' });
		return;
	}

	try {
		const saleTicket = await prisma.saleTicket.update({
			where: { id, tenantId },
			data: { checkedInAt: checkedIn ? new Date() : null },
			include,
		});
		res.json(toPublicSaleTicket(saleTicket));
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Venta no encontrada' });
			return;
		}
		throw err;
	}
}));

const markPaidSchema = z.object({ paidType: z.string().min(1) });

// Confirmación manual de pago (Opción "Link" — ver public.ts /checkout/hold), UNA venta a la vez —
// a propósito no agrupa otras filas PENDING del mismo comprador: dos asientos reservados juntos
// pueden terminar pagándose por separado (o uno cancelarse), así que confirmar uno no debe dar por
// pagado al otro sin que el manager lo vea explícitamente. Pide la forma de pago real (Efectivo,
// Transferencia, etc.) porque el hold solo guardaba "Link de pago" genérico como placeholder.
saleTicketsRouter.put('/:id/mark-paid', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = markPaidSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const saleTicket = await prisma.saleTicket.findUnique({ where: { id, tenantId } });
	if (!saleTicket) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}

	await prisma.saleTicket.update({ where: { id, tenantId }, data: { paidType: parsed.data.paidType } });
	await finalizePaidSaleTickets(tenantId, [id]);

	const updated = await prisma.saleTicket.findUnique({ where: { id, tenantId }, include });
	res.json(toPublicSaleTicket(updated));
}));

// Deshace un "Marcar como pagado" hecho por error — vuelve a PENDING sin tocar el stock ni liberar
// el asiento (para eso ya existe DELETE /:id, con su propio permiso RELEASE_SEAT). Solo tiene
// sentido para ventas que vinieron del checkout con pago (paymentProvider seteado); una venta manual
// del manager (paidType libre, sin provider) nunca pasó por PENDING, no hay nada que revertir.
saleTicketsRouter.put('/:id/mark-pending', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const saleTicket = await prisma.saleTicket.findUnique({ where: { id, tenantId } });
	if (!saleTicket) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}
	if (!saleTicket.paymentProvider) {
		res.status(400).json({ error: 'Esta venta no vino del checkout con pago — no hay nada que revertir.' });
		return;
	}

	const updated = await prisma.saleTicket.update({ where: { id, tenantId }, data: { paymentStatus: 'PENDING' }, include });
	res.json(toPublicSaleTicket(updated));
}));

// Borrar la venta libera el asiento (la disponibilidad se calcula por ausencia de SaleTicket) — una
// venta ya PAID requiere el permiso RELEASE_SEAT (perder una venta confirmada es una acción
// sensible), pero un hold todavía PENDING (checkout con pago sin confirmar, ver public.ts) es solo
// una reserva sin plata de por medio — cualquier manager autenticado puede soltarla, por ejemplo
// para destrabar un asiento de prueba o una compra abandonada sin tener que esperar los 15 minutos
// de expiración automática.
saleTicketsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const existing = await prisma.saleTicket.findUnique({ where: { id, tenantId }, select: { paymentStatus: true } });
	if (!existing) {
		res.status(404).json({ error: 'Venta no encontrada' });
		return;
	}
	if (existing.paymentStatus === 'PAID' && !(await hasLicense(req.user!.userId, 'RELEASE_SEAT'))) {
		res.status(403).json({ error: 'Tu usuario no tiene permiso para esta acción.' });
		return;
	}
	try {
		// Igual que sale-products.ts: liberar un asiento también devuelve el cupo al stock del
		// ticket, si no cada corrección/liberación termina "perdiendo" cupo real.
		const saleTicket = await prisma.$transaction(async (tx) => {
			const sale = await tx.saleTicket.delete({ where: { id, tenantId } });
			await tx.ticket.update({ where: { id: sale.ticketId, tenantId }, data: { count: { increment: 1 } } });
			return sale;
		});
		await logAudit({
			tenantId,
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
