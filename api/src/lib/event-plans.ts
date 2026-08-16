// Catálogo de tiers "evento único, sin suscripción" (Event-as-a-Service) — mismo criterio que
// lib/plans.ts: es código, no una tabla editable, porque cambia poco. El prefijo `EVENT_` en el
// código es lo que distingue a un tenant de este tipo de uno recurrente (BASICO/INTERMEDIO/
// AVANZADO/PRO_MAX) en cualquier chequeo del resto del backend — ver isEventPlanCode().
//
// Precio base: USD 1 por asistente incluido en el tier (pago único, no recurrente). Si el tenant
// vende por encima de ese tope, NO se bloquea la venta — se cobra overage a
// EVENT_OVERAGE_FEE_PER_PERSON_CENTS por persona, mismo mecanismo ya usado para los planes
// recurrentes (ver lib/overage.ts), facturado a mano por el Super Admin.

export type EventPlanCode = 'EVENT_100' | 'EVENT_300' | 'EVENT_500' | 'EVENT_1000' | 'EVENT_2500' | 'EVENT_5000';

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	// Centavos enteros, no dólares (ver lib/money.ts).
	priceCents: number;
};

const PRICE_PER_ATTENDEE_CENTS = 100;
export const EVENT_OVERAGE_FEE_PER_PERSON_CENTS = 125;

function definePlan(code: EventPlanCode, maxAttendees: number): EventPlanDefinition {
	return { code, name: `Evento único — hasta ${maxAttendees.toLocaleString('es-DO')} asistentes`, maxAttendees, priceCents: maxAttendees * PRICE_PER_ATTENDEE_CENTS };
}

export const EVENT_PLANS: Record<EventPlanCode, EventPlanDefinition> = {
	EVENT_100: definePlan('EVENT_100', 100),
	EVENT_300: definePlan('EVENT_300', 300),
	EVENT_500: definePlan('EVENT_500', 500),
	EVENT_1000: definePlan('EVENT_1000', 1000),
	EVENT_2500: definePlan('EVENT_2500', 2500),
	EVENT_5000: definePlan('EVENT_5000', 5000),
};

export const EVENT_PLAN_CODES = Object.keys(EVENT_PLANS) as EventPlanCode[];

export function isEventPlanCode(value: string | null | undefined): value is EventPlanCode {
	return value != null && value in EVENT_PLANS;
}
