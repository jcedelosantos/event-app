import { prismaUnscoped } from './prisma';
import { computeEventOverage } from './overage';
import { sendEventOverageSummary } from './mail';

const GRACE_HOURS = 24; // mismo criterio que event-plan-expiry.ts — no procesar el mismo día que termina

// Corre a diario (ver cron.schedule en server.ts). A diferencia de notifyIfOverageJustCrossed (que
// avisa EN CALIENTE, al momento de la venta que cruza el umbral), esto es el cierre: recorre los
// eventos que ya terminaron y todavía no fueron procesados (overageSummarySentAt null), y para los
// que tienen excedente manda el resumen final a la organización + Super Admin. Se marca
// overageSummarySentAt SIEMPRE (tenga o no overage) para no volver a mirar el mismo evento — su
// estado de excedente ya no cambia una vez pasado el período de gracia (no se contemplan ventas
// tardías).
export async function runEventOverageSummaryCheck(): Promise<void> {
	const graceDeadline = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);
	const endedEvents = await prismaUnscoped.event.findMany({
		where: { overageSummarySentAt: null, dateOff: { lt: graceDeadline } },
		select: { id: true, tenantId: true },
	});

	for (const { id: eventId, tenantId } of endedEvents) {
		try {
			await processEndedEvent(tenantId, eventId);
		} catch (err) {
			console.error(`[overage-summary] Falló el procesamiento del evento ${eventId}:`, err);
		}
	}
}

async function processEndedEvent(tenantId: number, eventId: number): Promise<void> {
	const overage = await computeEventOverage(tenantId, eventId);
	if (overage) {
		const [admin, tenant] = await Promise.all([
			prismaUnscoped.user.findFirst({ where: { tenantId, type: { type: 'ROOT' } } }),
			prismaUnscoped.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
		]);
		if (admin && tenant) {
			await sendEventOverageSummary({
				orgEmail: admin.email,
				tenantName: tenant.name,
				eventName: overage.eventName,
				includedCount: overage.included,
				soldCount: overage.soldCount,
				overageCents: overage.overageCents,
			});
		}
	}
	await prismaUnscoped.event.update({ where: { id: eventId }, data: { overageSummarySentAt: new Date() } });
}
