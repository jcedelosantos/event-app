import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma, prismaUnscoped } from './prisma';
import { uploadsDir } from './uploads';
import { PLANS, isPlanCode } from './plans';
import { computeTenantOverage } from './overage';
import { buildInvoicePdf } from './invoice-pdf';
import { getInvoiceIssuerConfig, nextNcf } from './invoice-config';

// MANUAL: Super Admin la generó a mano. AUTO: cron mensual (ver invoice-cron.ts). WELCOME: primera
// factura, disparada por el webhook de PayPal en la transición PENDING → ACTIVE de una suscripción
// recién creada (ver routes/signup.ts) — no espera al día 1 del mes siguiente.
export type InvoiceGeneratedBy = 'MANUAL' | 'AUTO' | 'WELCOME';

// Genera Y PERSISTE la factura de un tenant — usada tanto por el botón manual del Super Admin
// (routes/tenants.ts) como por el cron mensual (ver invoice-cron.ts). Antes de este archivo, la
// factura se armaba en memoria y se descartaba al enviarla: no quedaba ningún historial
// consultable. El PDF se escribe a uploadsDir (mismo mecanismo que logos/comprobantes, ver
// lib/uploads.ts) — la fila de Invoice es la fuente de verdad de los MONTOS, congelados al momento
// de emitir (si el plan del tenant cambia después, esta factura vieja no debe reflejar el precio
// nuevo), pdfUrl solo apunta al archivo descargable.
export async function generateAndStoreInvoice(tenantId: number, generatedBy: InvoiceGeneratedBy) {
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
	if (!tenant) throw new Error(`Tenant ${tenantId} no encontrado`);

	const subscription = await prismaUnscoped.subscription.findUnique({ where: { tenantId } });
	const overage = await computeTenantOverage(tenantId);
	const issuedAt = new Date();
	const dueAt = new Date(issuedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
	const invoiceNumber = `INV-${String(tenantId).padStart(4, '0')}-${issuedAt.getFullYear()}${String(issuedAt.getMonth() + 1).padStart(2, '0')}`;
	const billingPeriod = `${issuedAt.getFullYear()}-${String(issuedAt.getMonth() + 1).padStart(2, '0')}`;
	const issuer = await getInvoiceIssuerConfig();
	// Consume y avanza la secuencia real de DGII UNA sola vez por factura generada — null si el
	// Super Admin todavía no cargó el próximo NCF en Configuración de facturación.
	const ncf = await nextNcf();

	const pdf = await buildInvoicePdf({ tenant, plan: tenant.plan, subscription, overage, invoiceNumber, ncf, issuedAt, dueAt, issuer });

	const filename = `invoice-${tenantId}-${billingPeriod}-${randomUUID()}.pdf`;
	fs.writeFileSync(path.join(uploadsDir, filename), pdf);
	const pdfUrl = `/uploads/${filename}`;

	// Mismo criterio que invoice-pdf.ts: los precios ya incluyen ITBIS, así que el total NO le suma
	// nada arriba de plan+overage — es la misma cifra que aparece como "Total" en el PDF.
	const planDef = tenant.plan && isPlanCode(tenant.plan) ? PLANS[tenant.plan] : null;
	const planPriceUSD = planDef?.priceUSD ?? 0;
	const totalUSD = planPriceUSD + overage.totalUSD;

	const invoice = await prisma.invoice.create({
		data: {
			tenantId,
			invoiceNumber,
			ncf,
			billingPeriod,
			planCode: tenant.plan,
			planPriceUSD,
			overageUSD: overage.totalUSD,
			totalUSD,
			pdfUrl,
			generatedBy,
		},
	});

	return { invoice, pdf };
}
