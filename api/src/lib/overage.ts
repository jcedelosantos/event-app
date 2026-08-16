import { prisma } from './prisma';
import { PLANS, OVERAGE_FEE_PER_PERSON_CENTS, isPlanCode } from './plans';
import { EVENT_PLANS, EVENT_OVERAGE_FEE_PER_PERSON_CENTS, isEventPlanCode } from './event-plans';
import { sendOverageCrossedNotification } from './mail';

export type EventOverage = { eventId: number; eventName: string; soldCount: number; included: number; overageCount: number; overageCents: number };

// Mismo tope/tarifa que usan computeTenantOverage/notifyIfOverageJustCrossed/computeEventOverage —
// factorizado acá para no repetir el if/else de PLANS vs EVENT_PLANS en cada uno.
async function getIncludedAndFee(tenantId: number): Promise<{ included: number; feePerPersonCents: number } | null> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
	if (tenant?.plan && isPlanCode(tenant.plan)) {
		return { included: PLANS[tenant.plan].attendeesPerEvent, feePerPersonCents: OVERAGE_FEE_PER_PERSON_CENTS };
	}
	if (tenant?.plan && isEventPlanCode(tenant.plan)) {
		return { included: EVENT_PLANS[tenant.plan].maxAttendees, feePerPersonCents: EVENT_OVERAGE_FEE_PER_PERSON_CENTS };
	}
	return null;
}

// Se cobra por EVENTO, no acumulado — un evento con menos asistentes que el cupo del plan no resta
// contra otro evento que sí se pasó (ver plan económico). Sin cobro automático todavía (PayPal
// Subscriptions no soporta montos variables sin permisos de Reference Transactions) — esto solo
// calcula y expone el total para que el Super Admin lo facture aparte.
//
// Cubre tanto planes recurrentes (PLANS, tope = attendeesPerEvent, tarifa
// OVERAGE_FEE_PER_PERSON_CENTS) como tenants de evento único (EVENT_PLANS, tope = maxAttendees,
// tarifa EVENT_OVERAGE_FEE_PER_PERSON_CENTS) — mismo cálculo, cada uno con su propio tope/tarifa,
// así que el resto del sistema (panel de Super Admin, factura PDF) no necesita distinguir el tipo
// de plan. Todo en centavos enteros (ver lib/money.ts) — la multiplicación/suma es exacta, sin el
// Math.round(x*100)/100 que hacía falta antes para no arrastrar error de punto flotante.
export async function computeTenantOverage(tenantId: number): Promise<{ totalCents: number; events: EventOverage[] }> {
	const planInfo = await getIncludedAndFee(tenantId);
	if (!planInfo) return { totalCents: 0, events: [] };
	const { included, feePerPersonCents } = planInfo;

	const events = await prisma.event.findMany({ where: { tenantId }, select: { id: true, name: true } });
	const overages: EventOverage[] = [];
	let totalCents = 0;
	for (const event of events) {
		const soldCount = await prisma.saleTicket.count({ where: { eventId: event.id, tenantId } });
		const overageCount = Math.max(0, soldCount - included);
		if (overageCount === 0) continue;
		const overageCents = overageCount * feePerPersonCents;
		totalCents += overageCents;
		overages.push({ eventId: event.id, eventName: event.name, soldCount, included, overageCount, overageCents });
	}
	return { totalCents, events: overages };
}

// Overage de UN solo evento, sin escanear el resto del tenant — usado por GET /events/:id (badge
// en event-details.component.ts) donde recorrer todos los eventos del tenant en cada carga de
// página sería trabajo de sobra. null = tenant sin plan reconocido, o evento sin excedente.
export async function computeEventOverage(tenantId: number, eventId: number): Promise<EventOverage | null> {
	const planInfo = await getIncludedAndFee(tenantId);
	if (!planInfo) return null;
	const { included, feePerPersonCents } = planInfo;

	const [event, soldCount] = await Promise.all([
		prisma.event.findUnique({ where: { id: eventId, tenantId }, select: { name: true } }),
		prisma.saleTicket.count({ where: { eventId, tenantId } }),
	]);
	if (!event) return null;

	const overageCount = Math.max(0, soldCount - included);
	if (overageCount === 0) return null;
	const overageCents = overageCount * feePerPersonCents;
	return { eventId, eventName: event.name, soldCount, included, overageCount, overageCents };
}

// Best-effort: avisa la PRIMERA vez que un evento cruza el cupo incluido del plan, disparado desde
// cada punto donde se crea(n) SaleTicket nuevos (sale-tickets.ts POST /, POST /bulk-import,
// public.ts POST /purchase y POST /checkout/hold — este último cuenta porque assertEventCapacity/
// lib/capacity.ts ya trata los holds PENDING como cupo consumido, mismo criterio acá).
// ticketsJustSold es cuántos de esos son nuevos en ESTA operación, para poder reconstruir el
// conteo de ANTES sin una segunda consulta — si ya estaba por encima del cupo antes de esta venta,
// no se manda de nuevo. No bloquea nada, solo informa.
export async function notifyIfOverageJustCrossed(tenantId: number, eventId: number, ticketsJustSold: number): Promise<void> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, name: true } });
	const planInfo = await getIncludedAndFee(tenantId);
	if (tenant == null || planInfo == null) return;
	const { included } = planInfo;

	const soldCount = await prisma.saleTicket.count({ where: { eventId, tenantId } });
	const soldBefore = soldCount - ticketsJustSold;
	if (!(soldCount > included && soldBefore <= included)) return;

	const [admin, event] = await Promise.all([
		prisma.user.findFirst({ where: { tenantId, type: { type: 'ROOT' } } }),
		prisma.event.findUnique({ where: { id: eventId, tenantId }, select: { name: true } }),
	]);
	if (!admin || !event) return;

	await sendOverageCrossedNotification({ to: admin.email, tenantName: tenant.name, eventName: event.name, includedCount: included, soldCount });
}
