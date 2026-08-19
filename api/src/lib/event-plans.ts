// Catálogo de tiers "evento único, sin suscripción" (Event-as-a-Service) — mismo criterio que
// lib/plans.ts: es código, no una tabla editable, porque cambia poco. El prefijo `EVENT_` en el
// código es lo que distingue a un tenant de este tipo de uno recurrente (BASICO/INTERMEDIO/
// AVANZADO/PRO_MAX) en cualquier chequeo del resto del backend — ver isEventPlanCode(). El
// frontend (src/app/shared/event-plans.ts) ya no copia estos números a mano — los toma de
// plan-catalog.generated.ts (ver scripts/generate-plan-catalog.ts).
//
// Precio por asistente incluido en el tier (pago único, no recurrente) — decreciente por volumen,
// de $1.00 en el tier más chico a $0.75 en el más grande (decisión 2026-08-19). El tope de abajo
// (100 asistentes = $1.00/persona = $100) queda deliberadamente SIN descuento, a diferencia del
// resto de la curva: a esa tarifa ya queda apenas arriba de Intermedio ($99/mes, hasta 200
// asistentes — ver lib/plans.ts) y un descuento ahí lo dejaría MÁS barato que un mes completo de
// suscripción con eventos ilimitados, lo cual convertiría a Intermedio en una opción peor que
// evento único para el mismo cupo. El resto de la curva sí queda cómodamente arriba de su
// equivalente mensual (300/500 -> Avanzado $199/mes; 1,000 -> referencia interna de Pro
// Enterprise) — 2,500 y 5,000 no tienen equivalente mensual (ningún plan recurrente llega a ese
// cupo), ahí el descuento es puro volumen sin riesgo de canibalizar el SaaS.
//
// Si el tenant vende por encima del tope de su tier, NO se bloquea la venta — se cobra overage a
// EVENT_OVERAGE_FEE_PER_PERSON_CENTS por persona (flat, no escalona con el tier — es más caro que
// el peor de los precios base a propósito, para no incentivar comprar un tier chico "de más"),
// mismo mecanismo ya usado para los planes recurrentes (ver lib/overage.ts), facturado a mano por
// el Super Admin.

export type EventPlanCode = 'EVENT_100' | 'EVENT_300' | 'EVENT_500' | 'EVENT_1000' | 'EVENT_2500' | 'EVENT_5000';

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	// Centavos enteros, no dólares (ver lib/money.ts).
	priceCents: number;
};

export const EVENT_OVERAGE_FEE_PER_PERSON_CENTS = 125;

// Centavos por asistente en cada tier — ver la nota arriba sobre por qué 100 queda fuera de la
// curva descendente.
const PRICE_PER_ATTENDEE_CENTS: Record<number, number> = {
	100: 100,
	300: 90,
	500: 85,
	1000: 80,
	2500: 78,
	5000: 75,
};

function definePlan(code: EventPlanCode, maxAttendees: number): EventPlanDefinition {
	return { code, name: `Evento único — hasta ${maxAttendees.toLocaleString('es-DO')} asistentes`, maxAttendees, priceCents: maxAttendees * PRICE_PER_ATTENDEE_CENTS[maxAttendees] };
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
