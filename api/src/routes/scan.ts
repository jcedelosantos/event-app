import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { saleTicketInclude, toPublicSaleTicket } from './sale-tickets';
import { saleProductInclude, toPublicSaleProduct } from './sale-products';

export const scanRouter = Router();
scanRouter.use(requireAuth);

const ENTRY_WINDOW_MS = 60 * 60 * 1000; // el check-in/entrega abre 1 hora antes del inicio del evento

function entryWindowError(eventDateOn: Date): string | null {
	const opensAt = new Date(eventDateOn.getTime() - ENTRY_WINDOW_MS);
	if (new Date() < opensAt) {
		return `Todavía no se puede ingresar — el evento empieza a las ${eventDateOn.toLocaleString('es-DO')}, el check-in abre 1 hora antes (${opensAt.toLocaleString('es-DO')}).`;
	}
	return null;
}

// Un mismo lector de QR en la puerta/stand sirve tanto para hacer check-in de entradas como para
// entregar productos (goodies) — el código no indica de antemano a cuál tabla pertenece, así que
// se prueba primero contra SaleTicket y si no aparece, contra SaleProduct.
scanRouter.post('/', asyncHandler(async (req, res) => {
	const codeQR = String(req.body?.codeQR ?? '');
	if (!codeQR) {
		res.status(400).json({ error: 'Falta el código QR' });
		return;
	}

	const saleTicket = await prisma.saleTicket.findUnique({ where: { codeQR }, include: saleTicketInclude });
	if (saleTicket) {
		if (saleTicket.checkedInAt) {
			res.status(409).json({ type: 'ticket', error: 'Este QR ya fue escaneado', saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const windowError = entryWindowError(saleTicket.event.dateOn);
		if (windowError) {
			res.status(403).json({ type: 'ticket', error: windowError, saleTicket: toPublicSaleTicket(saleTicket) });
			return;
		}
		const updated = await prisma.saleTicket.update({ where: { id: saleTicket.id }, data: { checkedInAt: new Date() }, include: saleTicketInclude });
		res.json({ type: 'ticket', ok: true, saleTicket: toPublicSaleTicket(updated) });
		return;
	}

	const saleProduct = await prisma.saleProduct.findUnique({ where: { codeQR }, include: saleProductInclude });
	if (saleProduct) {
		if (saleProduct.deliveredAt) {
			res.status(409).json({ type: 'product', error: 'Este QR ya fue entregado', saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const windowError = entryWindowError(saleProduct.event.dateOn);
		if (windowError) {
			res.status(403).json({ type: 'product', error: windowError, saleProduct: toPublicSaleProduct(saleProduct) });
			return;
		}
		const updated = await prisma.saleProduct.update({ where: { id: saleProduct.id }, data: { deliveredAt: new Date() }, include: saleProductInclude });
		res.json({ type: 'product', ok: true, saleProduct: toPublicSaleProduct(updated) });
		return;
	}

	res.status(404).json({ error: 'Este QR no corresponde a ninguna venta' });
}));
