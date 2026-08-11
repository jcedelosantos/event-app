import { prismaUnscoped } from './prisma';
import { EVENT_PLAN_CODES } from './event-plans';

const GRACE_HOURS = 24; // no cortar check-ins tardíos el mismo día que termina el evento

// Corre a diario (ver cron.schedule en server.ts) — pasa a modo consulta (planStatus
// 'EVENT_ENDED') a los tenants de evento único cuyo evento ya terminó. requireActiveSubscription
// (middleware/plan.ts) ya trata cualquier planStatus !== 'ACTIVE' como "bloquear escrituras,
// permitir lecturas" — no hace falta tocar ese gate, solo poner el status correcto acá.
export async function runEventPlanExpiryCheck(): Promise<void> {
	const activeOnceTenants = await prismaUnscoped.tenant.findMany({
		where: { planStatus: 'ACTIVE', plan: { in: EVENT_PLAN_CODES } },
		select: { id: true },
	});

	for (const { id: tenantId } of activeOnceTenants) {
		try {
			await expireIfPastEvent(tenantId);
		} catch (err) {
			console.error(`[event-plan-expiry] Falló el chequeo del tenant ${tenantId}:`, err);
		}
	}
}

async function expireIfPastEvent(tenantId: number): Promise<void> {
	// Un tenant de evento único queda limitado a 1 evento (ver events.ts assertEventOncePlanCap) —
	// findFirst alcanza, no hay ambigüedad de cuál es "el" evento.
	const event = await prismaUnscoped.event.findFirst({
		where: { tenantId },
		orderBy: { dateOff: 'desc' },
		select: { dateOff: true, dateOn: true },
	});
	if (!event) return; // pagó pero todavía no creó su evento — nada que expirar

	const endsAt = event.dateOff ?? event.dateOn;
	const graceDeadline = new Date(endsAt.getTime() + GRACE_HOURS * 60 * 60 * 1000);
	if (new Date() < graceDeadline) return;

	await prismaUnscoped.tenant.update({ where: { id: tenantId }, data: { planStatus: 'EVENT_ENDED' } });
}
