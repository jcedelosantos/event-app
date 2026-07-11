import QRCode from 'qrcode';
import { Resend } from 'resend';
import type { Event as EventModel } from '@prisma/client';

type SaleTicketForEmail = {
	id: number;
	codeQR: string;
	description: string;
	seat: { name: string; area: { name: string } };
	ticket: { name: string; type: string; price: number };
};

type SaleProductForEmail = {
	id: number;
	codeQR: string;
	quantity: number;
	product: { name: string; type: string; price: number };
};

function getResendClient(): Resend | null {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) {
		console.warn('[mail] RESEND_API_KEY no configurada — el correo del ticket no se envía (el resto del flujo sigue funcionando).');
		return null;
	}
	return new Resend(apiKey);
}

function formatEventDate(date: Date): string {
	return new Date(date).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
}

type CardResult = { html: string; attachment: { filename: string; content: Buffer; contentId: string } };

// Gmail y otros clientes bloquean imágenes `data:` URI embebidas directo en el <img src> (riesgo de
// tracking/XSS) — el QR se veía como caja vacía en vez de la imagen. El QR va como attachment inline
// con contentId, referenciado en el HTML vía `cid:`, que es el mecanismo estándar soportado por
// Resend/la mayoría de los clientes de correo para imágenes embebidas en un email.
async function ticketCardHtml(event: EventModel, sale: SaleTicketForEmail): Promise<CardResult> {
	const cid = `qr-ticket-${sale.id}`;
	const qrBuffer = await QRCode.toBuffer(sale.codeQR, { margin: 1, width: 220 });
	const html = `
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #2a2a2a;">
			<tr>
				<td style="padding:20px;">
					<div style="color:#fff;font-family:Arial,Helvetica,sans-serif;">
						<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#dc3545;font-weight:bold;">${sale.ticket.type}</div>
						<div style="font-size:20px;font-weight:bold;margin:4px 0;">${event.name}</div>
						<div style="font-size:13px;color:#aaa;margin-bottom:12px;">${formatEventDate(event.dateOn)}</div>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
							<tr>
								<td style="vertical-align:top;">
									<div style="font-size:13px;color:#aaa;">Área</div>
									<div style="font-size:15px;margin-bottom:8px;">${sale.seat.area.name}</div>
									<div style="font-size:13px;color:#aaa;">Asiento</div>
									<div style="font-size:15px;margin-bottom:8px;">${sale.seat.name}</div>
									<div style="font-size:13px;color:#aaa;">Ticket</div>
									<div style="font-size:15px;">${sale.ticket.name} — ${sale.ticket.price} USD</div>
								</td>
								<td style="width:120px;text-align:right;vertical-align:top;">
									<img src="cid:${cid}" width="110" height="110" alt="QR" style="border-radius:6px;" />
								</td>
							</tr>
						</table>
					</div>
				</td>
			</tr>
		</table>
	`;
	return { html, attachment: { filename: `qr-ticket-${sale.id}.png`, content: qrBuffer, contentId: cid } };
}

async function productCardHtml(event: EventModel, sale: SaleProductForEmail): Promise<CardResult> {
	const cid = `qr-product-${sale.id}`;
	const qrBuffer = await QRCode.toBuffer(sale.codeQR, { margin: 1, width: 220 });
	const html = `
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #2a2a2a;">
			<tr>
				<td style="padding:20px;">
					<div style="color:#fff;font-family:Arial,Helvetica,sans-serif;">
						<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#dc3545;font-weight:bold;">${sale.product.type}</div>
						<div style="font-size:20px;font-weight:bold;margin:4px 0;">${event.name}</div>
						<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
							<tr>
								<td style="vertical-align:top;">
									<div style="font-size:13px;color:#aaa;">Producto</div>
									<div style="font-size:15px;margin-bottom:8px;">${sale.product.name}</div>
									<div style="font-size:13px;color:#aaa;">Cantidad</div>
									<div style="font-size:15px;">${sale.quantity}</div>
								</td>
								<td style="width:120px;text-align:right;vertical-align:top;">
									<img src="cid:${cid}" width="110" height="110" alt="QR" style="border-radius:6px;" />
								</td>
							</tr>
						</table>
					</div>
				</td>
			</tr>
		</table>
	`;
	return { html, attachment: { filename: `qr-product-${sale.id}.png`, content: qrBuffer, contentId: cid } };
}

export async function sendProductEmail(args: { to: string; clientName: string; event: EventModel; saleProducts: SaleProductForEmail[] }) {
	const resend = getResendClient();
	if (!resend) return;

	const cards = await Promise.all(args.saleProducts.map((sale) => productCardHtml(args.event, sale)));

	const html = `
		<div style="background:#000;padding:24px;font-family:Arial,Helvetica,sans-serif;">
			<h2 style="color:#fff;">¡Hola ${args.clientName}!</h2>
			<p style="color:#ccc;">Tu compra de productos para <strong style="color:#fff;">${args.event.name}</strong> quedó confirmada. Presentá el código QR en el stand de entrega — es válido una sola vez.</p>
			${cards.map((c) => c.html).join('')}
			<p style="color:#666;font-size:12px;">Este correo fue generado automáticamente por Seat App.</p>
		</div>
	`;

	await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
		to: args.to,
		subject: `Tus productos para ${args.event.name}`,
		html,
		attachments: cards.map((c) => c.attachment),
	});
}

export async function sendTicketEmail(args: { to: string; clientName: string; event: EventModel; saleTickets: SaleTicketForEmail[] }) {
	const resend = getResendClient();
	if (!resend) return;

	const cards = await Promise.all(args.saleTickets.map((sale) => ticketCardHtml(args.event, sale)));

	const html = `
		<div style="background:#000;padding:24px;font-family:Arial,Helvetica,sans-serif;">
			<h2 style="color:#fff;">¡Hola ${args.clientName}!</h2>
			<p style="color:#ccc;">Tu compra para <strong style="color:#fff;">${args.event.name}</strong> quedó confirmada. Presentá el código QR de cada ticket en la entrada — cada uno es válido una sola vez.</p>
			${cards.map((c) => c.html).join('')}
			<p style="color:#666;font-size:12px;">Este correo fue generado automáticamente por Seat App.</p>
		</div>
	`;

	await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
		to: args.to,
		subject: `Tus tickets para ${args.event.name}`,
		html,
		attachments: cards.map((c) => c.attachment),
	});
}
