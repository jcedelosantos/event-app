import { prisma, prismaUnscoped } from './prisma';
import { EVENT_PLAN_CODES } from './event-plans';
import { generateAndStoreInvoice } from './invoice-generation';

// Corre el día 1 de cada mes (ver cron.schedule en server.ts) — genera y guarda automáticamente la
// factura mensual de cada tenant con suscripción recurrente ACTIVA. Los tenants de evento único
// (EVENT_*, ver lib/event-plans.ts) quedan afuera a propósito: pagan una vez, no tienen ciclo
// mensual, y su plan no calcula precio de suscripción (ver invoice-generation.ts — planPriceUSD
// sale 0 para un código que isPlanCode no reconoce).
export async function runMonthlyInvoiceGeneration(): Promise<void> {
	const recurringTenants = await prismaUnscoped.tenant.findMany({
		where: { planStatus: 'ACTIVE', plan: { not: null, notIn: EVENT_PLAN_CODES } },
		select: { id: true },
	});

	const now = new Date();
	const billingPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

	for (const { id: tenantId } of recurringTenants) {
		try {
			// Idempotencia: si el proceso se reinicia el mismo día (o el cron corre dos veces por
			// cualquier motivo), no duplica la factura automática de este período — una factura
			// MANUAL del Super Admin en el mismo mes no cuenta acá, esa sí puede repetirse a propósito
			// (reemisión/ajuste).
			const alreadyGenerated = await prisma.invoice.findFirst({ where: { tenantId, billingPeriod, generatedBy: 'AUTO' } });
			if (alreadyGenerated) continue;

			await generateAndStoreInvoice(tenantId, 'AUTO');
		} catch (err) {
			console.error(`[invoice-cron] Falló la factura automática del tenant ${tenantId}:`, err);
		}
	}
}
