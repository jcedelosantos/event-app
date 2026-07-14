import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { saleTicketInclude, toPublicSaleTicket } from './sale-tickets';
import { saleProductInclude, toPublicSaleProduct } from './sale-products';

export const scanRouter = Router();
scanRouter.use(requireAuth, requireTenant);

const ENTRY_WINDOW_MS = 60 * 60 * 1000; // el check-in/entrega abre 1 hora antes del inicio del evento
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

function entryWindowError(eventDateOn: Date, startTime: string | null): string | null {
	const startsAt = eventStartInstant(eventDateOn, startTime);
	if (!startsAt) return null;
	const opensAt = new Date(startsAt.getTime() - ENTRY_WINDOW_MS);
	if (new Date() < opensAt) {
		return `Todavía no se puede ingresar — el evento empieza a las ${startsAt.toLocaleString('es-DO')}, el check-in abre 1 hora antes (${opensAt.toLocaleString('es-DO')}).`;
	}
	return null;
}

// Un mismo lector de QR en la puerta/stand sirve tanto para hacer check-in de entradas como para
// entregar productos (goodies) — el código no indica de antemano a cuál tabla pertenece, así que
// se prueba primero contra SaleTicket y si no aparece, contra SaleProduct. Se acota por tenantId del
// staff que escanea — un QR real es imposible de adivinar entre tenants, pero así ningún lookup
// queda sin el filtro que exige el tenant-guard.
scanRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const codeQR = String(req.body?.codeQR ?? '');
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
		const windowError = entryWindowError(saleTicket.event.dateOn, saleTicket.event.startTime);
		if (windowError) {
			res.status(403).json({ type: 'ticket', error: windowError, saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const updated = await prisma.saleTicket.update({ where: { id: saleTicket.id, tenantId }, data: { checkedInAt: new Date() }, include: saleTicketInclude });
		res.json({ type: 'ticket', ok: true, saleTicket: toPublicSaleTicket(updated) });
		return;
	}

	const saleProduct = await prisma.saleProduct.findFirst({ where: { codeQR, tenantId }, include: saleProductInclude });
	if (saleProduct) {
		if (saleProduct.deliveredAt) {
			res.status(409).json({ type: 'product', error: 'Este QR ya fue entregado', saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const windowError = entryWindowError(saleProduct.event.dateOn, saleProduct.event.startTime);
		if (windowError) {
			res.status(403).json({ type: 'product', error: windowError, saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const updated = await prisma.saleProduct.update({ where: { id: saleProduct.id, tenantId }, data: { deliveredAt: new Date() }, include: saleProductInclude });
		res.json({ type: 'product', ok: true, saleProduct: toPublicSaleProduct(updated) });
		return;
	}

	res.status(404).json({ error: 'Este QR no corresponde a ninguna venta' });
}));
