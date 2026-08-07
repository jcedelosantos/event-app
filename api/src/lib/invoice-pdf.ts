import PDFDocument from 'pdfkit';
import { PLANS, isPlanCode } from './plans';
import type { EventOverage } from './overage';

export type InvoiceInput = {
	tenant: { name: string; slug: string };
	plan: string | null;
	subscription: { currentPeriodEnd: Date | null } | null;
	overage: { totalUSD: number; events: EventOverage[] };
	invoiceNumber: string;
	issuedAt: Date;
};

function formatUSD(amount: number): string {
	return `USD ${amount.toFixed(2)}`;
}

function formatDate(date: Date): string {
	return date.toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
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

		doc.fontSize(20).fillColor('#000').text('Seat App', left, doc.y);
		doc.fontSize(10).fillColor('#888').text('Factura de suscripción', left, doc.y);
		doc.moveDown(1.2);

		doc.fontSize(9).fillColor('#888').text('FACTURA N°', left, doc.y);
		doc.fontSize(12).fillColor('#000').text(input.invoiceNumber, left, doc.y);
		doc.moveDown(0.4);
		doc.fontSize(9).fillColor('#888').text('FECHA DE EMISIÓN', left, doc.y);
		doc.fontSize(12).fillColor('#000').text(formatDate(input.issuedAt), left, doc.y);
		doc.moveDown(0.8);

		doc.fontSize(9).fillColor('#888').text('FACTURAR A', left, doc.y);
		doc.fontSize(14).fillColor('#000').text(input.tenant.name, left, doc.y);
		doc.fontSize(10).fillColor('#555').text(input.tenant.slug, left, doc.y);
		doc.moveDown(1.2);

		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.8);

		// 4 columnas: concepto (ancha, a la izquierda) + cantidad/unitario/total (angostas, a la
		// derecha) — colX marca dónde EMPIEZA cada columna, colW cuánto mide.
		const colConceptW = contentWidth * 0.5;
		const colQtyX = left + colConceptW;
		const colQtyW = contentWidth * 0.15;
		const colUnitX = colQtyX + colQtyW;
		const colUnitW = contentWidth * 0.17;
		const colTotalX = colUnitX + colUnitW;
		const colTotalW = right - colTotalX;

		function tableHeader() {
			const y = doc.y;
			doc.fontSize(9).fillColor('#888');
			doc.text('CONCEPTO', left, y, { width: colConceptW });
			doc.text('CANT.', colQtyX, y, { width: colQtyW, align: 'right' });
			doc.text('UNITARIO', colUnitX, y, { width: colUnitW, align: 'right' });
			doc.text('TOTAL', colTotalX, y, { width: colTotalW, align: 'right' });
			doc.y = y + 14;
			doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
			doc.moveDown(0.4);
		}

		function tableRow(concept: string, qty: string, unit: string, total: string) {
			const y = doc.y;
			doc.fontSize(10).fillColor('#000');
			doc.text(concept, left, y, { width: colConceptW - 10 });
			const conceptBottom = doc.y;
			doc.text(qty, colQtyX, y, { width: colQtyW, align: 'right' });
			doc.text(unit, colUnitX, y, { width: colUnitW, align: 'right' });
			doc.text(total, colTotalX, y, { width: colTotalW, align: 'right' });
			doc.y = Math.max(conceptBottom, y + 14);
			doc.moveDown(0.3);
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
		tableRow(`Suscripción — Plan ${planDef?.name ?? input.plan ?? 'Sin plan'}`, '1', formatUSD(planPrice), formatUSD(planPrice));

		let overageTotal = 0;
		for (const ev of input.overage.events) {
			tableRow(`Exceso de aforo — ${ev.eventName} (${ev.overageCount} personas)`, String(ev.overageCount), formatUSD(0.6), formatUSD(ev.overageUSD));
			overageTotal += ev.overageUSD;
		}

		doc.moveDown(0.3);
		doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#ddd').stroke();
		doc.moveDown(0.5);

		const total = planPrice + overageTotal;
		totalsRow('Subtotal suscripción', formatUSD(planPrice));
		totalsRow('Subtotal exceso de aforo', formatUSD(overageTotal));
		doc.moveDown(0.2);
		totalsRow('TOTAL', formatUSD(total), { bold: true, big: true });

		doc.moveDown(1.5);
		doc.fontSize(8).fillColor('#999').text(
			'El exceso de aforo no se cobra automático dentro de la suscripción de PayPal — esta factura es el detalle de referencia para facturarlo aparte.',
			left,
			doc.y,
			{ width: contentWidth },
		);

		doc.end();
	});
}
