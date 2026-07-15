import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { Resend } from 'resend';
import type { Event as EventModel } from '@prisma/client';

type SaleTicketForEmail = {
	id: number;
	codeQR: string;
	description: string;
	seat: { name: string; area: { name: string } };
	// attendeeType solo viene seteado en tenants CLUB (ver Ticket.attendeeType) — cuando está,
	// reemplaza a `type` (VIP/Normal) en el ticket impreso/enviado, igual que ya se hace en las
	// tarjetas de ticket/evento del manager.
	ticket: { name: string; type: string; price: number; attendeeType?: string | null };
};

function ticketTypeLabel(ticket: { type: string; attendeeType?: string | null }): string {
	if (ticket.attendeeType === 'SOCIO') return 'Socio';
	if (ticket.attendeeType === 'INVITADO') return 'Invitado';
	return ticket.type;
}

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

// startTime se guarda como "HH:mm" en 24h (ver create-event-modal en el frontend) — mismo formato
// 12h con AM/PM que ya usa el picker público, para que la hora se lea igual en todos lados.
function formatEventTime(startTime: string): string {
	const [hoursStr, minutesStr] = startTime.split(':');
	const hours24 = Number(hoursStr);
	const minutes = Number(minutesStr);
	if (Number.isNaN(hours24) || Number.isNaN(minutes)) return startTime;
	const period = hours24 >= 12 ? 'PM' : 'AM';
	const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
	return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatEventDateTime(event: EventModel): string {
	const date = formatEventDate(event.dateOn);
	return event.startTime ? `${date} — ${formatEventTime(event.startTime)}` : date;
}

// Genera el PDF descargable/imprimible de un ticket: mismo dato que la tarjeta del correo, pero
// como archivo aparte que el cliente puede guardar o imprimir para presentarlo en la entrada, en vez
// de depender de que su cliente de correo siga mostrando la imagen inline (algunos la bloquean o
// la comprimen al reenviar).
function buildTicketPdf(event: EventModel, sale: SaleTicketForEmail, qrBuffer: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ size: [320, 500], margin: 24 });
		const chunks: Buffer[] = [];
		doc.on('data', (chunk) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

		doc.fontSize(10).fillColor('#dc3545').text(ticketTypeLabel(sale.ticket).toUpperCase(), { characterSpacing: 1 });
		doc.moveDown(0.4);
		doc.fontSize(18).fillColor('#000').text(event.name, { width: contentWidth });
		doc.moveDown(0.2);
		doc.fontSize(11).fillColor('#555').text(formatEventDateTime(event));
		doc.moveDown(1);

		doc.fontSize(10).fillColor('#888').text('Área');
		doc.fontSize(14).fillColor('#000').text(sale.seat.area.name);
		doc.moveDown(0.5);
		doc.fontSize(10).fillColor('#888').text('Asiento');
		doc.fontSize(14).fillColor('#000').text(sale.seat.name);
		doc.moveDown(0.5);
		doc.fontSize(10).fillColor('#888').text('Ticket');
		doc.fontSize(14).fillColor('#000').text(`${sale.ticket.name} — ${sale.ticket.price} USD`);
		doc.moveDown(1.2);

		const qrSize = 220;
		const qrX = doc.page.margins.left + (contentWidth - qrSize) / 2;
		doc.image(qrBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
		doc.y += qrSize + 12;

		doc.fontSize(9).fillColor('#888').text('Presentá este código en la entrada del evento. Válido una sola vez.', { align: 'center', width: contentWidth });

		doc.end();
	});
}

function buildProductPdf(event: EventModel, sale: SaleProductForEmail, qrBuffer: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ size: [320, 490], margin: 24 });
		const chunks: Buffer[] = [];
		doc.on('data', (chunk) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

		doc.fontSize(10).fillColor('#dc3545').text(sale.product.type.toUpperCase(), { characterSpacing: 1 });
		doc.moveDown(0.4);
		doc.fontSize(18).fillColor('#000').text(event.name, { width: contentWidth });
		doc.moveDown(0.2);
		doc.fontSize(11).fillColor('#555').text(formatEventDateTime(event));
		doc.moveDown(1);

		doc.fontSize(10).fillColor('#888').text('Producto');
		doc.fontSize(14).fillColor('#000').text(sale.product.name);
		doc.moveDown(0.5);
		doc.fontSize(10).fillColor('#888').text('Cantidad');
		doc.fontSize(14).fillColor('#000').text(String(sale.quantity));
		doc.moveDown(1.2);

		const qrSize = 220;
		const qrX = doc.page.margins.left + (contentWidth - qrSize) / 2;
		doc.image(qrBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
		doc.y += qrSize + 12;

		doc.fontSize(9).fillColor('#888').text('Presentá este código en el stand de entrega. Válido una sola vez.', { align: 'center', width: contentWidth });

		doc.end();
	});
}

type CardResult = { html: string; attachment: { filename: string; content: Buffer }; previewCid: string; previewPng: Buffer };

// Gmail y otros clientes bloquean imágenes `data:` URI embebidas directo en el <img src> (riesgo de
// tracking/XSS) — el QR se veía como caja vacía en vez de la imagen. El QR de vista previa va como
// attachment inline con contentId, referenciado en el HTML vía `cid:`. Además de esa vista previa,
// cada venta adjunta su propio PDF descargable (mismo QR + datos del ticket/producto) para que el
// cliente lo guarde o lo imprima sin depender de que el correo siga mostrando la imagen inline.
async function ticketCardHtml(event: EventModel, sale: SaleTicketForEmail): Promise<CardResult> {
	const cid = `qr-ticket-${sale.id}`;
	const qrBuffer = await QRCode.toBuffer(sale.codeQR, { margin: 1, width: 220 });
	const pdfBuffer = await buildTicketPdf(event, sale, qrBuffer);
	const html = `
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #2a2a2a;">
			<tr>
				<td style="padding:20px;">
					<div style="color:#fff;font-family:Arial,Helvetica,sans-serif;">
						<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#dc3545;font-weight:bold;">${ticketTypeLabel(sale.ticket)}</div>
						<div style="font-size:20px;font-weight:bold;margin:4px 0;">${event.name}</div>
						<div style="font-size:13px;color:#aaa;margin-bottom:12px;">${formatEventDateTime(event)}</div>
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
						<div style="margin-top:12px;font-size:12px;color:#888;">Tu ticket en PDF va adjunto (<strong style="color:#ccc;">qr-ticket-${sale.id}.pdf</strong>) — descargalo o imprimilo para presentarlo en la entrada.</div>
					</div>
				</td>
			</tr>
		</table>
	`;
	return { html, attachment: { filename: `qr-ticket-${sale.id}.pdf`, content: pdfBuffer }, previewCid: cid, previewPng: qrBuffer };
}

async function productCardHtml(event: EventModel, sale: SaleProductForEmail): Promise<CardResult> {
	const cid = `qr-product-${sale.id}`;
	const qrBuffer = await QRCode.toBuffer(sale.codeQR, { margin: 1, width: 220 });
	const pdfBuffer = await buildProductPdf(event, sale, qrBuffer);
	const html = `
		<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid #2a2a2a;">
			<tr>
				<td style="padding:20px;">
					<div style="color:#fff;font-family:Arial,Helvetica,sans-serif;">
						<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#dc3545;font-weight:bold;">${sale.product.type}</div>
						<div style="font-size:20px;font-weight:bold;margin:4px 0;">${event.name}</div>
						<div style="font-size:13px;color:#aaa;margin-bottom:12px;">${formatEventDateTime(event)}</div>
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
						<div style="margin-top:12px;font-size:12px;color:#888;">Tu comprobante en PDF va adjunto (<strong style="color:#ccc;">qr-product-${sale.id}.pdf</strong>) — descargalo o imprimilo para presentarlo en el stand.</div>
					</div>
				</td>
			</tr>
		</table>
	`;
	return { html, attachment: { filename: `qr-product-${sale.id}.pdf`, content: pdfBuffer }, previewCid: cid, previewPng: qrBuffer };
}

export async function sendProductEmail(args: { to: string; clientName: string; event: EventModel; saleProducts: SaleProductForEmail[] }) {
	const resend = getResendClient();
	if (!resend) return;

	const cards = await Promise.all(args.saleProducts.map((sale) => productCardHtml(args.event, sale)));

	const html = `
		<div style="background:#000;padding:24px;font-family:Arial,Helvetica,sans-serif;">
			<h2 style="color:#fff;">¡Hola ${args.clientName}!</h2>
			<p style="color:#ccc;">Tu compra de productos para <strong style="color:#fff;">${args.event.name}</strong> quedó confirmada. Presentá el código QR (o el PDF adjunto) en el stand de entrega — es válido una sola vez.</p>
			${cards.map((c) => c.html).join('')}
			<p style="color:#666;font-size:12px;">Este correo fue generado automáticamente por Seat App.</p>
		</div>
	`;

	await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
		to: args.to,
		subject: `Tus productos para ${args.event.name}`,
		html,
		attachments: cards.flatMap((c) => [
			{ filename: c.attachment.filename, content: c.attachment.content },
			{ filename: `${c.previewCid}.png`, content: c.previewPng, contentId: c.previewCid },
		]),
	});
}

export async function sendTicketEmail(args: { to: string; clientName: string; event: EventModel; saleTickets: SaleTicketForEmail[] }) {
	const resend = getResendClient();
	if (!resend) return;

	const cards = await Promise.all(args.saleTickets.map((sale) => ticketCardHtml(args.event, sale)));

	const html = `
		<div style="background:#000;padding:24px;font-family:Arial,Helvetica,sans-serif;">
			<h2 style="color:#fff;">¡Hola ${args.clientName}!</h2>
			<p style="color:#ccc;">Tu compra para <strong style="color:#fff;">${args.event.name}</strong> quedó confirmada. Presentá el código QR (o el PDF adjunto) de cada ticket en la entrada — cada uno es válido una sola vez.</p>
			${cards.map((c) => c.html).join('')}
			<p style="color:#666;font-size:12px;">Este correo fue generado automáticamente por Seat App.</p>
		</div>
	`;

	await resend.emails.send({
		from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
		to: args.to,
		subject: `Tus tickets para ${args.event.name}`,
		html,
		attachments: cards.flatMap((c) => [
			{ filename: c.attachment.filename, content: c.attachment.content },
			{ filename: `${c.previewCid}.png`, content: c.previewPng, contentId: c.previewCid },
		]),
	});
}
