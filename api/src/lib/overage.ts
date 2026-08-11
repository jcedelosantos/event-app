import { prisma } from './prisma';
import { PLANS, OVERAGE_FEE_PER_PERSON_USD, isPlanCode } from './plans';
import { EVENT_PLANS, EVENT_OVERAGE_FEE_PER_PERSON_USD, isEventPlanCode } from './event-plans';

export type EventOverage = { eventId: number; eventName: string; soldCount: number; included: number; overageCount: number; overageUSD: number };

// Se cobra por EVENTO, no acumulado — un evento con menos asistentes que el cupo del plan no resta
// contra otro evento que sí se pasó (ver plan económico). Sin cobro automático todavía (PayPal
// Subscriptions no soporta montos variables sin permisos de Reference Transactions) — esto solo
// calcula y expone el total para que el Super Admin lo facture aparte.
//
// Cubre tanto planes recurrentes (PLANS, tope = attendeesPerEvent, tarifa OVERAGE_FEE_PER_PERSON_USD)
// como tenants de evento único (EVENT_PLANS, tope = maxAttendees, tarifa
// EVENT_OVERAGE_FEE_PER_PERSON_USD) — mismo cálculo, cada uno con su propio tope/tarifa, así que
// el resto del sistema (panel de Super Admin, factura PDF) no necesita distinguir el tipo de plan.
export async function computeTenantOverage(tenantId: number): Promise<{ totalUSD: number; events: EventOverage[] }> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
	let included: number;
	let feePerPersonUSD: number;
	if (tenant?.plan && isPlanCode(tenant.plan)) {
		included = PLANS[tenant.plan].attendeesPerEvent;
		feePerPersonUSD = OVERAGE_FEE_PER_PERSON_USD;
	} else if (tenant?.plan && isEventPlanCode(tenant.plan)) {
		included = EVENT_PLANS[tenant.plan].maxAttendees;
		feePerPersonUSD = EVENT_OVERAGE_FEE_PER_PERSON_USD;
	} else {
		return { totalUSD: 0, events: [] };
	}

	const events = await prisma.event.findMany({ where: { tenantId }, select: { id: true, name: true } });
	const overages: EventOverage[] = [];
	let totalUSD = 0;
	for (const event of events) {
		const soldCount = await prisma.saleTicket.count({ where: { eventId: event.id, tenantId } });
		const overageCount = Math.max(0, soldCount - included);
		if (overageCount === 0) continue;
		const overageUSD = Math.round(overageCount * feePerPersonUSD * 100) / 100;
		totalUSD += overageUSD;
		overages.push({ eventId: event.id, eventName: event.name, soldCount, included, overageCount, overageUSD });
	}
	return { totalUSD: Math.round(totalUSD * 100) / 100, events: overages };
}
