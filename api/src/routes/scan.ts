import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { saleTicketInclude, toPublicSaleTicket } from './sale-tickets';
import { saleProductInclude, toPublicSaleProduct } from './sale-products';
import { childInclude, toPublicChild } from './children';

export const scanRouter = Router();
scanRouter.use(requireAuth, requireTenant, requireActiveSubscription);

const CLUB_UTC_OFFSET_HOURS = 4; // República Dominicana, AST fijo todo el año (sin horario de verano)

// dateOn es el día calendario del evento (medianoche UTC, ver utils/dates.ts). El horario real de
// inicio vive aparte en startTime ("HH:mm", hora local del club) porque mezclar hora-de-reloj
// dentro de dateOn rompería la lógica de "día calendario" que usa el resto de la app (dashboard,
// calendario). Si el evento no tiene startTime cargado (eventos viejos, campo opcional), no hay
// forma de saber la hora real de inicio — se deja pasar el check-in sin restricción.
function eventStartInstant(eventDateOn: Date, startTime: string | null): Date | null {
	if (!startTime) return null;
	const [hours, minutes] = startTime.split(':').map(Number);
	return new Date(
		Date.UTC(eventDateOn.getUTCFullYear(), eventDateOn.getUTCMonth(), eventDateOn.getUTCDate(), hours + CLUB_UTC_OFFSET_HOURS, minutes),
	);
}

// checkInWindowHours es configurable por evento (Event.checkInWindowHours, default 1) — antes era un
// valor fijo igual para todos los eventos, ver create-event-modal para el campo del form.
function entryWindowError(eventDateOn: Date, startTime: string | null, checkInWindowHours: number): string | null {
	const startsAt = eventStartInstant(eventDateOn, startTime);
	if (!startsAt) return null;
	const opensAt = new Date(startsAt.getTime() - checkInWindowHours * 60 * 60 * 1000);
	if (new Date() < opensAt) {
		return `Todavía no se puede ingresar — el evento empieza a las ${startsAt.toLocaleString('es-DO')}, el check-in abre ${checkInWindowHours}h antes (${opensAt.toLocaleString('es-DO')}).`;
	}
	return null;
}

// Un mismo lector de QR en la puerta/stand sirve tanto para hacer check-in de entradas como para
// entregar productos (goodies) — el código no indica de antemano a cuál tabla pertenece, así que
// se prueba primero contra SaleTicket y si no aparece, contra SaleProduct. Se acota por tenantId del
// staff que escanea — un QR real es imposible de adivinar entre tenants, pero así ningún lookup
// queda sin el filtro que exige el tenant-guard.
// Si la puerta indicada tiene algún AccessPointTicket configurado, el ticket escaneado tiene que
// estar en ese allow-list — cero filas para esa puerta significa sin restricción (ver
// AccessPoint/AccessPointTicket en schema.prisma), así que un evento que nunca configuró reglas de
// puerta sigue dejando pasar todo, igual que antes de esta feature.
async function accessPointDenialError(accessPointId: number | undefined, ticketId: number, tenantId: number): Promise<string | null> {
	if (!accessPointId) return null;
	const accessPoint = await prisma.accessPoint.findFirst({ where: { id: accessPointId, tenantId }, include: { allowedTickets: { select: { ticketId: true } } } });
	if (!accessPoint || !accessPoint.allowedTickets.length) return null;
	const allowed = accessPoint.allowedTickets.some((t) => t.ticketId === ticketId);
	return allowed ? null : `Este ticket no tiene acceso por la puerta "${accessPoint.name}".`;
}

scanRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const codeQR = String(req.body?.codeQR ?? '');
	const accessPointId = req.body?.accessPointId ? Number(req.body.accessPointId) : undefined;
	if (!codeQR) {
		res.status(400).json({ error: 'Falta el código QR' });
		return;
	}

	const saleTicket = await prisma.saleTicket.findFirst({ where: { codeQR, tenantId }, include: saleTicketInclude });
	if (saleTicket) {
		if (saleTicket.checkedInAt) {
			res.status(409).json({ type: 'ticket', error: 'Este QR ya fue escaneado', saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const windowError = entryWindowError(saleTicket.event.dateOn, saleTicket.event.startTime, saleTicket.event.checkInWindowHours);
		if (windowError) {
			res.status(403).json({ type: 'ticket', error: windowError, saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const gateError = await accessPointDenialError(accessPointId, saleTicket.ticketId, tenantId);
		if (gateError) {
			res.status(403).json({ type: 'ticket', error: gateError, saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const updated = await prisma.saleTicket.update({
			where: { id: saleTicket.id, tenantId },
			data: { checkedInAt: new Date(), accessPointId: accessPointId ?? undefined },
			include: saleTicketInclude,
		});
		res.json({ type: 'ticket', ok: true, saleTicket: toPublicSaleTicket(updated) });
		return;
	}

	const saleProduct = await prisma.saleProduct.findFirst({ where: { codeQR, tenantId }, include: saleProductInclude });
	if (saleProduct) {
		if (saleProduct.deliveredAt) {
			res.status(409).json({ type: 'product', error: 'Este QR ya fue entregado', saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const windowError = entryWindowError(saleProduct.event.dateOn, saleProduct.event.startTime, saleProduct.event.checkInWindowHours);
		if (windowError) {
			res.status(403).json({ type: 'product', error: windowError, saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const updated = await prisma.saleProduct.update({ where: { id: saleProduct.id, tenantId }, data: { deliveredAt: new Date() }, include: saleProductInclude });
		res.json({ type: 'product', ok: true, saleProduct: toPublicSaleProduct(updated) });
		return;
	}

	// El talón de una familia (tenants CHURCH) — todos los hijos del mismo padre/madre para el
	// mismo evento comparten el mismo codeQR (ver family-code.ts), y el mismo código se imprime dos
	// veces por niño (padre + pulsera). Retiro del niño (checkedInAt) y entrega de comida
	// (saleProduct.deliveredAt) son DOS acciones independientes que pueden pasar en momentos y
	// puestos distintos — se puede entregar la comida sin que el niño haya sido retirado todavía, o
	// viceversa — así que `mode` decide cuál de las dos toca este escaneo. Sin ventana de entrada (a
	// diferencia de tickets/productos) porque ambas pasan durante/después del servicio.
	const familyChildren = await prisma.child.findMany({ where: { codeQR, tenantId }, include: childInclude });
	if (familyChildren.length) {
		const mode = req.body?.mode === 'meal' ? 'meal' : 'pickup';
		const now = new Date();

		if (mode === 'meal') {
			const withMeal = familyChildren.filter((c) => c.saleProductId);
			if (!withMeal.length) {
				res.status(400).json({ type: 'child', error: 'Esta familia no tiene comida del día para retirar.', children: familyChildren.map(toPublicChild) });
				return;
			}
			const pendingMeals = withMeal.filter((c) => !c.saleProduct?.deliveredAt);
			if (!pendingMeals.length) {
				res.status(409).json({ type: 'child', error: 'La comida de esta familia ya fue entregada.', children: familyChildren.map(toPublicChild) });
				return;
			}
			for (const c of pendingMeals) {
				await prisma.saleProduct.update({ where: { id: c.saleProductId!, tenantId }, data: { deliveredAt: now } });
			}
		} else {
			const pending = familyChildren.filter((c) => !c.checkedInAt);
			if (!pending.length) {
				res.status(409).json({ type: 'child', error: 'Esta familia ya fue retirada.', children: familyChildren.map(toPublicChild) });
				return;
			}
			for (const c of pending) {
				await prisma.child.update({ where: { id: c.id, tenantId }, data: { checkedInAt: now, accessPointId: accessPointId ?? undefined } });
			}
		}

		const updated = await prisma.child.findMany({ where: { codeQR, tenantId }, include: childInclude });
		res.json({ type: 'child', ok: true, children: updated.map(toPublicChild) });
		return;
	}

	res.status(404).json({ error: 'Este QR no corresponde a ninguna venta' });
}));

type SyncItem = { tempId: string; codeQR: string; accessPointId?: number; mode?: 'pickup' | 'meal'; clientScannedAt: string };
type SyncItemResult = { tempId: string; status: 'applied' | 'conflict' | 'error'; error?: string };

// Núcleo de la reconciliación offline (ver POST /scan/sync): decide, para UNA entidad puntual
// (un SaleTicket, un SaleProduct, o el SaleProduct de un Child), quién de los intentos "gana" —
// el de `clientScannedAt` más temprano — cuando dos dispositivos offline escanearon el mismo QR
// antes de poder sincronizar. `existingAt` idéntico a `clientScannedAt` es tratado como el MISMO
// intento reintentando el sync (no un conflicto real) — sin esto, un reintento de red por un
// timeout duplicaría el ScanConflict del mismo escaneo.
async function reconcileEntity(params: {
	tenantId: number;
	entityType: 'SaleTicket' | 'SaleProduct' | 'Child';
	entityId: number;
	codeQR: string;
	existingAt: Date | null;
	clientScannedAt: Date;
	accessPointId?: number;
	applyAt: (at: Date) => Promise<void>;
}): Promise<'applied' | 'conflict'> {
	const { tenantId, entityType, entityId, codeQR, existingAt, clientScannedAt, accessPointId, applyAt } = params;
	if (!existingAt || clientScannedAt.getTime() === existingAt.getTime()) {
		if (!existingAt) await applyAt(clientScannedAt);
		return 'applied';
	}
	if (clientScannedAt.getTime() < existingAt.getTime()) {
		// Este intento en realidad pasó ANTES que el que ya estaba guardado — pasa a ser el oficial,
		// y el que estaba guardado queda registrado como el conflicto (perdió la reconciliación).
		await applyAt(clientScannedAt);
		await prisma.scanConflict.create({ data: { tenantId, entityType, entityId, codeQR, attemptedAt: existingAt, accessPointId } });
		return 'applied';
	}
	await prisma.scanConflict.create({ data: { tenantId, entityType, entityId, codeQR, attemptedAt: clientScannedAt, accessPointId } });
	return 'conflict';
}

async function applySyncItem(tenantId: number, item: SyncItem): Promise<SyncItemResult> {
	const clientScannedAt = new Date(item.clientScannedAt);
	if (Number.isNaN(clientScannedAt.getTime())) {
		return { tempId: item.tempId, status: 'error', error: 'clientScannedAt inválido' };
	}
	const accessPointId = item.accessPointId ?? undefined;

	const saleTicket = await prisma.saleTicket.findFirst({ where: { codeQR: item.codeQR, tenantId } });
	if (saleTicket) {
		const status = await reconcileEntity({
			tenantId,
			entityType: 'SaleTicket',
			entityId: saleTicket.id,
			codeQR: item.codeQR,
			existingAt: saleTicket.checkedInAt,
			clientScannedAt,
			accessPointId,
			applyAt: async (at) => {
				await prisma.saleTicket.update({ where: { id: saleTicket.id, tenantId }, data: { checkedInAt: at, accessPointId } });
			},
		});
		return { tempId: item.tempId, status };
	}

	const saleProduct = await prisma.saleProduct.findFirst({ where: { codeQR: item.codeQR, tenantId } });
	if (saleProduct) {
		const status = await reconcileEntity({
			tenantId,
			entityType: 'SaleProduct',
			entityId: saleProduct.id,
			codeQR: item.codeQR,
			existingAt: saleProduct.deliveredAt,
			clientScannedAt,
			applyAt: async (at) => {
				await prisma.saleProduct.update({ where: { id: saleProduct.id, tenantId }, data: { deliveredAt: at } });
			},
		});
		return { tempId: item.tempId, status };
	}

	const familyChildren = await prisma.child.findMany({ where: { codeQR: item.codeQR, tenantId } });
	if (familyChildren.length) {
		const mode = item.mode === 'meal' ? 'meal' : 'pickup';
		const statuses: ('applied' | 'conflict')[] = [];

		if (mode === 'meal') {
			for (const c of familyChildren) {
				if (!c.saleProductId) continue;
				const sp = await prisma.saleProduct.findUnique({ where: { id: c.saleProductId } });
				if (!sp) continue;
				statuses.push(
					await reconcileEntity({
						tenantId,
						entityType: 'SaleProduct',
						entityId: sp.id,
						codeQR: item.codeQR,
						existingAt: sp.deliveredAt,
						clientScannedAt,
						applyAt: async (at) => {
							await prisma.saleProduct.update({ where: { id: sp.id, tenantId }, data: { deliveredAt: at } });
						},
					}),
				);
			}
			if (!statuses.length) return { tempId: item.tempId, status: 'error', error: 'Esta familia no tiene comida del día para retirar.' };
		} else {
			for (const c of familyChildren) {
				statuses.push(
					await reconcileEntity({
						tenantId,
						entityType: 'Child',
						entityId: c.id,
						codeQR: item.codeQR,
						existingAt: c.checkedInAt,
						clientScannedAt,
						accessPointId,
						applyAt: async (at) => {
							await prisma.child.update({ where: { id: c.id, tenantId }, data: { checkedInAt: at, accessPointId } });
						},
					}),
				);
			}
		}
		return { tempId: item.tempId, status: statuses.some((s) => s === 'conflict') ? 'conflict' : 'applied' };
	}

	return { tempId: item.tempId, status: 'error', error: 'Este QR no corresponde a ninguna venta' };
}

// Sincroniza un lote de escaneos hechos offline (ver OfflineScanQueueService en el frontend) — NO
// re-valida reglas de puerta (ver AccessPointTicket): la persona ya entró físicamente en el
// momento del escaneo offline, rechazarla acá no deshace nada. Un item por vez, en el orden que
// vino el array (no hace falta ordenar por clientScannedAt acá — reconcileEntity ya compara contra
// lo que esté guardado en cada paso, así que el orden de llegada del array no cambia el resultado
// final para un mismo codeQR).
scanRouter.post('/sync', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const items = Array.isArray(req.body?.items) ? (req.body.items as SyncItem[]) : [];
	if (!items.length) {
		res.status(400).json({ error: 'Falta el array items' });
		return;
	}

	const results: SyncItemResult[] = [];
	for (const item of items) {
		if (!item?.tempId || !item?.codeQR || !item?.clientScannedAt) {
			results.push({ tempId: item?.tempId ?? '', status: 'error', error: 'Item incompleto' });
			continue;
		}
		results.push(await applySyncItem(tenantId, item));
	}
	res.json({ results });
}));

scanRouter.get('/conflicts', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;

	const conflicts = await prisma.scanConflict.findMany({
		where: { tenantId, resolvedAt: null },
		include: { accessPoint: { select: { id: true, name: true } } },
		orderBy: { createdAt: 'desc' },
	});

	// ScanConflict solo guarda entityType+entityId (genérico, mismo criterio que AuditLog.entity) —
	// hay que resolverlo por tipo para mostrar algo legible (nombre/asiento) en vez de un codeQR
	// pelado, y para saber a qué evento pertenece cada conflicto (filtro por eventId).
	const ticketIds = conflicts.filter((c) => c.entityType === 'SaleTicket').map((c) => c.entityId);
	const productIds = conflicts.filter((c) => c.entityType === 'SaleProduct').map((c) => c.entityId);
	const childIds = conflicts.filter((c) => c.entityType === 'Child').map((c) => c.entityId);

	const [tickets, products, children] = await Promise.all([
		ticketIds.length
			? prisma.saleTicket.findMany({ where: { id: { in: ticketIds }, tenantId }, include: { client: true, seat: true, event: { select: { id: true, name: true } } } })
			: [],
		productIds.length
			? prisma.saleProduct.findMany({ where: { id: { in: productIds }, tenantId }, include: { client: true, product: true, event: { select: { id: true, name: true } } } })
			: [],
		childIds.length ? prisma.child.findMany({ where: { id: { in: childIds }, tenantId }, include: { parent: true, event: { select: { id: true, name: true } } } }) : [],
	]);
	const ticketMap = new Map(tickets.map((t) => [t.id, t]));
	const productMap = new Map(products.map((p) => [p.id, p]));
	const childMap = new Map(children.map((c) => [c.id, c]));

	const enriched = conflicts.map((c) => {
		let summary = c.codeQR;
		let event: { id: number; name: string } | null = null;
		if (c.entityType === 'SaleTicket') {
			const t = ticketMap.get(c.entityId);
			if (t) {
				summary = `${t.client.name} ${t.client.lastname} — ${t.seat.name}`;
				event = t.event;
			}
		} else if (c.entityType === 'SaleProduct') {
			const p = productMap.get(c.entityId);
			if (p) {
				summary = `${p.client.name} ${p.client.lastname} — ${p.product.name}`;
				event = p.event;
			}
		} else if (c.entityType === 'Child') {
			const ch = childMap.get(c.entityId);
			if (ch) {
				summary = `${ch.name} (hijo/a de ${ch.parent.name} ${ch.parent.lastname})`;
				event = ch.event;
			}
		}
		return { ...c, summary, event };
	});

	const filtered = eventId ? enriched.filter((c) => c.event?.id === eventId) : enriched;
	res.json(filtered);
}));

scanRouter.put('/conflicts/:id/resolve', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	try {
		const conflict = await prisma.scanConflict.update({ where: { id, tenantId }, data: { resolvedAt: new Date() } });
		res.json(conflict);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Conflicto no encontrado' });
			return;
		}
		throw err;
	}
}));
