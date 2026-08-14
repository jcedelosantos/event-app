import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import { PLANS, isPlanCode } from './plans';
import { uploadsDir } from './uploads';
import type { EventOverage } from './overage';
import type { InvoiceIssuerConfig } from './invoice-config';

export type InvoiceInput = {
	tenant: { name: string; slug: string; rnc: string | null; address: string | null; phone: string | null };
	plan: string | null;
	subscription: { currentPeriodEnd: Date | null } | null;
	overage: { totalUSD: number; events: EventOverage[] };
	invoiceNumber: string; // referencia interna de seat-app — siempre existe
	ncf: string | null; // comprobante fiscal real de DGII — null si el Super Admin no configuró el rango
	issuedAt: Date;
	dueAt: Date;
	issuer: InvoiceIssuerConfig;
};

// ITBIS (impuesto a la transferencia de bienes industrializados y servicios) — IVA de República
// Dominicana, 18% sobre el subtotal de servicios. Ver la factura modelo (CNaco_B0100000506.pdf)
// que definió este formato.
const ITBIS_RATE = 0.18;

function formatUSD(amount: number): string {
	return `USD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// timeZone explícito: el server (Railway) corre en UTC, así que sin esto una fecha generada de
// noche en RD (UTC-4) puede mostrar el día siguiente — mismo gotcha de fechas UTC ya visto en jsPDF.
function formatDate(date: Date): string {
	return date.toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Santo_Domingo' });
}

// logoUrl puede venir absoluta (http://.../uploads/x.png) o relativa (/uploads/x.png) — en ambos
// casos el archivo real vive en uploadsDir con ese mismo nombre (ver lib/uploads.ts), así que solo
// hace falta el basename para resolver la ruta local que pdfkit necesita.
function resolveLogoPath(logoUrl: string | null): string | null {
	if (!logoUrl) return null;
	const filename = path.basename(logoUrl.split('?')[0]);
	const filePath = path.join(uploadsDir, filename);
	return fs.existsSync(filePath) ? filePath : null;
}

// Factura modelo de la mensualidad + overage de un tenant — no hay cobro automático de esto (ver
// lib/overage.ts: PayPal Subscriptions no soporta montos variables sin permisos de Reference
// Transactions), así que la agencia se apoya en este PDF para facturar el overage aparte cada mes.
//
// Cada celda se ubica con x/y explícitos en vez de encadenar `continued: true` — mezclar ambos hace
// que pdfkit pierda la posición real del cursor entre celdas de una misma fila (columnas de números
// terminaban en blanco), así que acá cada `.text()` es independiente y la fila avanza a mano.
export function buildInvoicePdf(input: InvoiceInput): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
		doc.on('data', (chunk) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const left = doc.page.margins.left;
		const right = doc.page.width - doc.page.margins.right;
		const contentWidth = right - left;
		const planDef = input.plan && isPlanCode(input.plan) ? PLANS[input.plan] : null;
		const { issuer } = input;

		// --- Encabezado: logo arriba a la izquierda + título/datos del emisor a la derecha (mismo
		// layout que la factura modelo) ---
		const headerTop = doc.y;
		const logoPath = resolveLogoPath(issuer.logoUrl);
		if (logoPath) {
			// fit preserva el aspect ratio del logo — pdfkit solo soporta JPEG/PNG; si la imagen subida
			// es de otro formato (ej. webp) esto tira, y no vale la pena romper la factura entera por
			// eso, así que se omite el logo en silencio.
			try {
				doc.image(logoPath, left, headerTop, { fit: [140, 55] });
			} catch {
				// logo omitido — formato de imagen no soportado por pdfkit
			}
		}
		doc.y = headerTop;

		doc.fontSize(26).fillColor('#000').text('Factura', left, doc.y, { width: contentWidth, align: 'right' });
		doc.moveDown(0.3);
		if (issuer.name) {
			doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(issuer.name, left, doc.y, { width: contentWidth, align: 'right' });
			doc.font('Helvetica');
		}
		const issuerLines = [
			issuer.rnc && `RNC: ${issuer.rnc}`,
			issuer.email,
			issuer.phone,
			issuer.address,
		].filter((line): line is string => Boolean(line));
		doc.fontSize(9).fillColor('#555');
		for (const line of issuerLines) {
			doc.text(line, left, doc.y, { width: contentWidth, align: 'right' });
		}
		if (issuer.bankAccountNumber) {
			const bankParts = [
				issuer.bankAccountHolder && `Titular: ${issuer.bankAccountHolder}`,
				`Cta: ${issuer.bankAccountNumber}`,
				issuer.bankAccountType,
				issuer.bankName,
			].filter(Boolean);
			doc.fontSize(8).fillColor('#888').text(bankParts.join(' · '), left, doc.y, { width: contentWidth, align: 'right' });
		}
		doc.moveDown(0.8);
		if (logoPath) doc.y = Math.max(doc.y, headerTop + 55 + 10);

		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.6);

		// --- "Para" (cliente) + Comprobante/Fecha/Vencimiento, en dos columnas ---
		const blockTop = doc.y;
		const colLeftW = contentWidth * 0.55;
		const colRightX = left + colLeftW;
		const colRightW = contentWidth - colLeftW;

		doc.font('Helvetica-Bold').fontSize(9).fillColor('#888').text('PARA', left, blockTop, { width: colLeftW });
		doc.font('Helvetica-Bold').fontSize(13).fillColor('#000').text(input.tenant.name, left, doc.y, { width: colLeftW });
		doc.font('Helvetica').fontSize(9).fillColor('#555');
		const clientLines = [
			input.tenant.rnc && `RNC: ${input.tenant.rnc}`,
			input.tenant.phone,
			input.tenant.address,
		].filter((line): line is string => Boolean(line));
		for (const line of clientLines) {
			doc.text(line, left, doc.y, { width: colLeftW });
		}
		const leftBottom = doc.y;

		function infoLine(label: string, value: string, y: number): number {
			doc.font('Helvetica-Bold').fontSize(9).fillColor('#000').text(label, colRightX, y, { width: colRightW * 0.5 });
			doc.font('Helvetica').fontSize(9).fillColor('#000').text(value, colRightX + colRightW * 0.5, y, { width: colRightW * 0.5, align: 'right' });
			return y + 16;
		}
		let rightY = blockTop;
		rightY = infoLine('Comprobante #', input.ncf ?? input.invoiceNumber, rightY);
		rightY = infoLine('Fecha', formatDate(input.issuedAt), rightY);
		rightY = infoLine('Vencimiento', formatDate(input.dueAt), rightY);
		if (input.ncf) {
			doc.fontSize(8).fillColor('#999').text(`Ref. interna: ${input.invoiceNumber}`, colRightX, rightY, { width: colRightW, align: 'right' });
			rightY += 12;
		}

		doc.y = Math.max(leftBottom, rightY) + 10;
		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.6);

		// --- Tabla de conceptos ---
		const colConceptW = contentWidth * 0.5;
		const colQtyX = left + colConceptW;
		const colQtyW = contentWidth * 0.15;
		const colUnitX = colQtyX + colQtyW;
		const colUnitW = contentWidth * 0.17;
		const colTotalX = colUnitX + colUnitW;
		const colTotalW = right - colTotalX;
		const HEADER_BLUE = '#2f8fd1';

		function tableHeader() {
			const y = doc.y;
			const headerHeight = 22;
			doc.rect(left, y, contentWidth, headerHeight).fill(HEADER_BLUE);
			doc.fillColor('#fff').fontSize(9);
			doc.text('SERVICIO', left + 6, y + 6, { width: colConceptW - 6 });
			doc.text('CANTIDAD', colQtyX, y + 6, { width: colQtyW, align: 'right' });
			doc.text('PRECIO', colUnitX, y + 6, { width: colUnitW, align: 'right' });
			doc.text('IMPORTE', colTotalX, y + 6, { width: colTotalW - 6, align: 'right' });
			doc.y = y + headerHeight;
			doc.moveDown(0.4);
		}

		function tableRow(concept: string, note: string | null, qty: string, unit: string, total: string) {
			const y = doc.y;
			doc.font('Helvetica-Bold').fontSize(10).fillColor('#000');
			doc.text(concept, left, y, { width: colConceptW - 10 });
			let conceptBottom = doc.y;
			if (note) {
				doc.font('Helvetica-Oblique').fontSize(9).fillColor('#888');
				doc.text(note, left, conceptBottom + 2, { width: colConceptW - 10 });
				conceptBottom = doc.y;
			}
			doc.font('Helvetica').fontSize(10).fillColor('#000');
			doc.text(qty, colQtyX, y, { width: colQtyW, align: 'right' });
			doc.text(unit, colUnitX, y, { width: colUnitW, align: 'right' });
			doc.text(total, colTotalX, y, { width: colTotalW, align: 'right' });
			doc.y = Math.max(conceptBottom, y + 14);
			doc.moveDown(0.4);
		}

		function totalsRow(label: string, value: string, opts: { bold?: boolean; big?: boolean } = {}) {
			const y = doc.y;
			doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
			doc.fontSize(opts.big ? 13 : 9).fillColor(opts.big ? '#000' : '#888');
			doc.text(label, left, y, { width: colTotalX - left, align: 'right' });
			doc.fillColor('#000').text(value, colTotalX, y, { width: colTotalW, align: 'right' });
			doc.font('Helvetica');
			doc.y = y + (opts.big ? 18 : 14);
		}

		tableHeader();
		const planPrice = planDef?.priceUSD ?? 0;
		const periodLabel = input.issuedAt.toLocaleDateString('es-DO', { month: 'long', year: 'numeric', timeZone: 'America/Santo_Domingo' });
		tableRow(
			`Suscripción — Plan ${planDef?.name ?? input.plan ?? 'Sin plan'}`,
			`Corresponde a ${periodLabel}.`,
			'1',
			formatUSD(planPrice),
			formatUSD(planPrice),
		);

		let overageTotal = 0;
		for (const ev of input.overage.events) {
			tableRow(
				`Exceso de aforo — ${ev.eventName}`,
				`${ev.overageCount} persona(s) por encima del cupo del plan (${ev.included}).`,
				String(ev.overageCount),
				formatUSD(0.6),
				formatUSD(ev.overageUSD),
			);
			overageTotal += ev.overageUSD;
		}

		doc.moveDown(0.3);
		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.5);

		// --- Instrucción de pago (izquierda) + totales con ITBIS (derecha) ---
		const totalsTop = doc.y;
		const payColW = contentWidth * 0.42;

		doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Instrucción de pago', left, totalsTop, { width: payColW });
		doc.font('Helvetica').fontSize(9).fillColor('#555');
		const payLines = [
			issuer.bankAccountNumber,
			[issuer.bankName, issuer.bankAccountType].filter(Boolean).join(' '),
			[issuer.rnc, issuer.bankAccountHolder || issuer.name].filter(Boolean).join(' — '),
		].filter(Boolean);
		for (const line of payLines) {
			doc.text(line, left, doc.y, { width: payColW });
		}
		const payBottom = doc.y;

		doc.y = totalsTop;
		// Los precios que ve el cliente (plan y overage, mismos montos que en pricing/PayPal) YA
		// incluyen ITBIS — antes esto le sumaba 18% ARRIBA de esos montos, dejando el total de la
		// factura por encima de lo que el cliente realmente paga. Se calcula la porción de impuesto
		// que ya va DENTRO del total (igual que un recibo con IVA incluido), no se agrega nada.
		const total = planPrice + overageTotal;
		const itbis = Math.round((total - total / (1 + ITBIS_RATE)) * 100) / 100;
		const subtotal = total - itbis;
		totalsRow('Subtotal', formatUSD(subtotal));
		totalsRow(`ITBIS incluido (${Math.round(ITBIS_RATE * 100)}%)`, formatUSD(itbis));
		doc.moveDown(0.15);
		totalsRow('Total', formatUSD(total), { bold: true });
		const totalsBottom = doc.y;

		doc.y = Math.max(payBottom, totalsBottom) + 10;
		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.5);

		// La suscripción ya la cobró PayPal automáticamente al momento de activarse/renovarse — lo
		// único que puede seguir pendiente de cobro es el overage (se factura aparte a mano, ver nota
		// al pie). Sin overage, la factura queda saldada; con overage, el saldo es SOLO esa parte, no
		// el total (la parte del plan ya está paga).
		const dueUSD = overageTotal;
		const isPaid = dueUSD <= 0;
		const saldoY = doc.y;
		const saldoHeight = 28;
		const saldoBoxX = left + contentWidth * 0.45;
		const saldoBoxW = right - saldoBoxX;
		const saldoLabelW = 110;
		const saldoAmountX = saldoBoxX + 15 + saldoLabelW + 10;
		doc.rect(saldoBoxX, saldoY, saldoBoxW, saldoHeight).fill('#f2f2f2');
		doc.font('Helvetica-Bold').fontSize(11).fillColor('#333').text(isPaid ? 'Estado' : 'Saldo deudor', saldoBoxX + 15, saldoY + 8, { width: saldoLabelW });
		doc
			.font('Helvetica-Bold')
			.fontSize(13)
			.fillColor('#2e7d32')
			.text(isPaid ? 'Pagado' : formatUSD(dueUSD), saldoAmountX, saldoY + 6, { width: saldoBoxX + saldoBoxW - saldoAmountX - 15, align: 'right' });
		doc.y = saldoY + saldoHeight;

		doc.moveDown(1.5);
		doc.font('Helvetica').fontSize(8).fillColor('#999').text(
			'El exceso de aforo no se cobra automático dentro de la suscripción de PayPal — esta factura es el detalle de referencia para facturarlo aparte.',
			left,
			doc.y,
			{ width: contentWidth },
		);

		doc.end();
	});
}
