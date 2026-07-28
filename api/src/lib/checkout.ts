import { prisma } from './prisma';
import { sendTicketEmail } from './mail';
import { toPublicUser } from './serialize';

const include = {
	event: true,
	seat: { include: { area: true } },
	ticket: true,
	client: { include: { type: true } },
	seller: { include: { type: true } },
};

// Pasa a PAID un lote de SaleTicket (mismo comprador, mismos asientos reservados juntos) y dispara
// el email con el QR real — usado por /checkout/paypal/capture, el webhook de PayPal, y "Marcar como
// pagado" en el panel de QRs (Opción "Link"). Idempotente: si ya estaban en PAID no reenvía el
// correo, solo re-arma la misma respuesta (así el capture del cliente y el webhook, que pueden
// llegar los dos para la misma orden, nunca duplican el email).
export async function finalizePaidSaleTickets(tenantId: number, saleTicketIds: number[]) {
	const rows = await prisma.saleTicket.findMany({ where: { id: { in: saleTicketIds }, tenantId }, include });
	if (!rows.length) return null;

	const stillPending = rows.filter((r) => r.paymentStatus !== 'PAID');
	if (stillPending.length) {
		await prisma.saleTicket.updateMany({
			where: { id: { in: stillPending.map((r) => r.id) }, tenantId },
			data: { paymentStatus: 'PAID', paymentExpiresAt: null },
		});
	}

	const publicSaleTickets = rows.map(({ client, seller, ...rest }) => ({
		...rest,
		paymentStatus: 'PAID',
		client: toPublicUser(client),
		seller: toPublicUser(seller),
	}));

	if (stillPending.length) {
		const first = rows[0];
		sendTicketEmail({ to: first.client.email, clientName: first.client.name, event: first.event, saleTickets: publicSaleTickets }).catch((err) =>
			console.error('No se pudo enviar el email del ticket (checkout con pago):', err),
		);
	}

	return { saleTickets: publicSaleTickets };
}
