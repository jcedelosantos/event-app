import { prisma } from './prisma';
import { sendTicketEmail, sendProductEmail } from './mail';
import { toPublicUser } from './serialize';

const ticketInclude = {
	event: true,
	seat: { include: { area: true } },
	ticket: true,
	client: { include: { type: true } },
	seller: { include: { type: true } },
};

const productInclude = {
	event: true,
	product: true,
	client: { include: { type: true } },
};

// Pasa a PAID un lote de SaleTicket/SaleProduct (mismo comprador, mismo checkout) y dispara los
// emails de confirmación con el QR real — usado por /checkout/paypal/capture, el webhook de PayPal,
// y "Marcar como pagado" en el panel de QRs (Opción "Link", tanto para tickets como para productos).
// Idempotente de verdad: el capture del cliente y el webhook de PayPal pueden llegar los dos casi al
// mismo tiempo para la misma orden — el `updateMany` con `paymentStatus: { not: 'PAID' }` en el where
// hace el chequeo-y-transición en una sola operación atómica (mismo patrón que el descuento de stock
// en sale-tickets.ts/sale-products.ts), así que de las dos llamadas concurrentes solo UNA ve
// `count > 0` y dispara el email; la otra ve 0 y sabe que ya se encargó la otra. Antes se leía el
// estado con un SELECT separado y se decidía en JS si mandar el correo — ambas llamadas podían leer
// "todavía PENDING" antes de que cualquiera escribiera, duplicando el email.
export async function finalizePaidCheckout(tenantId: number, ids: { saleTicketIds?: number[]; saleProductIds?: number[] }) {
	const saleTicketIds = ids.saleTicketIds ?? [];
	const saleProductIds = ids.saleProductIds ?? [];

	const ticketRows = saleTicketIds.length ? await prisma.saleTicket.findMany({ where: { id: { in: saleTicketIds }, tenantId }, include: ticketInclude }) : [];
	const productRows = saleProductIds.length ? await prisma.saleProduct.findMany({ where: { id: { in: saleProductIds }, tenantId }, include: productInclude }) : [];
	if (!ticketRows.length && !productRows.length) return null;

	const ticketsTransitioned = ticketRows.length
		? await prisma.saleTicket.updateMany({
				where: { id: { in: saleTicketIds }, tenantId, paymentStatus: { not: 'PAID' } },
				data: { paymentStatus: 'PAID', paymentExpiresAt: null },
			})
		: { count: 0 };
	const productsTransitioned = productRows.length
		? await prisma.saleProduct.updateMany({
				where: { id: { in: saleProductIds }, tenantId, paymentStatus: { not: 'PAID' } },
				data: { paymentStatus: 'PAID', paymentExpiresAt: null },
			})
		: { count: 0 };

	if (ticketsTransitioned.count > 0) {
		// El hold guardó "(pendiente)" en la descripción a propósito (ver public.ts) — al confirmar el
		// pago ya no aplica, y dejarlo así confundía en el panel de QRs a alguien viendo una venta ya
		// pagada que todavía decía "pendiente". Se basa en `ticketRows` (no en el resultado del
		// updateMany, que no devuelve las filas) — un string replace es idempotente, no hay riesgo de
		// duplicar nada si por alguna razón corre dos veces.
		await Promise.all(
			ticketRows
				.filter((r) => r.paymentStatus !== 'PAID' && r.description.includes('(pendiente)'))
				.map((r) => prisma.saleTicket.update({ where: { id: r.id, tenantId }, data: { description: r.description.replace(' (pendiente)', '') } })),
		);
	}
	if (productsTransitioned.count > 0) {
		await Promise.all(
			productRows
				.filter((r) => r.paymentStatus !== 'PAID' && r.description.includes('(pendiente)'))
				.map((r) => prisma.saleProduct.update({ where: { id: r.id, tenantId }, data: { description: r.description.replace(' (pendiente)', '') } })),
		);
	}

	const publicSaleTickets = ticketRows.map(({ client, seller, ...rest }) => ({
		...rest,
		paymentStatus: 'PAID',
		client: toPublicUser(client),
		seller: toPublicUser(seller),
	}));
	const publicSaleProducts = productRows.map((r) => ({ ...r, paymentStatus: 'PAID' }));

	if (ticketsTransitioned.count > 0) {
		const first = ticketRows[0];
		sendTicketEmail({ to: first.client.email, clientName: first.client.name, event: first.event, saleTickets: publicSaleTickets }).catch((err) =>
			console.error('No se pudo enviar el email del ticket (checkout con pago):', err),
		);
	}
	if (productsTransitioned.count > 0) {
		const first = productRows[0];
		sendProductEmail({ to: first.client.email, clientName: first.client.name, event: first.event, saleProducts: publicSaleProducts }).catch((err) =>
			console.error('No se pudo enviar el email de productos (checkout con pago):', err),
		);
	}

	return { saleTickets: publicSaleTickets, saleProducts: publicSaleProducts };
}
