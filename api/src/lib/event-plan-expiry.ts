import { prismaUnscoped } from './prisma';
import { EVENT_PLAN_CODES } from './event-plans';

const GRACE_HOURS = 24; // no cortar check-ins tardíos el mismo día que termina el evento
const ARCHIVE_AFTER_DAYS = 30; // ver comentario de Tenant.planStatus en schema.prisma (ARCHIVED)

// Corre a diario (ver cron.schedule en server.ts) — dos pasos sobre tenants de evento único:
// 1) pasa a modo consulta (planStatus 'EVENT_ENDED') a los que su evento ya terminó.
// 2) pasa a 'ARCHIVED' a los que ya llevan 30 días en EVENT_ENDED sin que nadie los reactive.
// requireActiveSubscription (middleware/plan.ts) ya trata cualquier planStatus !== 'ACTIVE' como
// "bloquear escrituras, permitir lecturas" para AMBOS — no hace falta tocarlo. ARCHIVED suma un
// bloqueo extra (el login, ver routes/auth.ts) que EVENT_ENDED no tiene.
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

	const endedTenants = await prismaUnscoped.tenant.findMany({
		where: { planStatus: 'EVENT_ENDED', plan: { in: EVENT_PLAN_CODES } },
		select: { id: true },
	});

	for (const { id: tenantId } of endedTenants) {
		try {
			await archiveIfLongEnded(tenantId);
		} catch (err) {
			console.error(`[event-plan-expiry] Falló el archivado del tenant ${tenantId}:`, err);
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

// Sin un timestamp propio de "cuándo pasó a EVENT_ENDED": se deriva del mismo dateOff/dateOn que ya
// decide esa transición (graceDeadline de expireIfPastEvent) sumándole los 30 días — evita agregar
// un campo nuevo solo para esto, y da el mismo resultado porque el cron corre a diario.
async function archiveIfLongEnded(tenantId: number): Promise<void> {
	const event = await prismaUnscoped.event.findFirst({
		where: { tenantId },
		orderBy: { dateOff: 'desc' },
		select: { dateOff: true, dateOn: true },
	});
	if (!event) return;

	const endsAt = event.dateOff ?? event.dateOn;
	const archiveDeadline = new Date(endsAt.getTime() + GRACE_HOURS * 60 * 60 * 1000 + ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000);
	if (new Date() < archiveDeadline) return;

	await prismaUnscoped.tenant.update({ where: { id: tenantId }, data: { planStatus: 'ARCHIVED' } });
}
