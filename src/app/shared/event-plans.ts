// Precio/cupo de los tiers de evento único ya NO se copian a mano acá — vienen de
// plan-catalog.generated.ts, generado automáticamente desde api/src/lib/event-plans.ts en cada
// build/start (ver scripts/generate-plan-catalog.ts, revisión 9 de código).

import { EVENT_PLAN_CATALOG, EVENT_OVERAGE_FEE_PER_PERSON_CENTS, type EventPlanCode } from './plan-catalog.generated';

export type { EventPlanCode };
export { EVENT_OVERAGE_FEE_PER_PERSON_CENTS };

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	// Centavos enteros, no dólares (ver shared/money.ts).
	priceCents: number;
};

// Nombre corto para esta pantalla (a diferencia del nombre largo del catálogo, pensado para
// facturas/Super Admin) — acá el contexto de "evento único" ya está dado por la página.
export const EVENT_PLANS: EventPlanDefinition[] = EVENT_PLAN_CATALOG.map((p) => ({
	code: p.code,
	name: `Hasta ${p.maxAttendees.toLocaleString('es-DO')} asistentes`,
	maxAttendees: p.maxAttendees,
	priceCents: p.priceCents,
}));

const EVENT_PLAN_CODES: EventPlanCode[] = EVENT_PLAN_CATALOG.map((p) => p.code);

export function isEventPlanCode(value: string | null | undefined): value is EventPlanCode {
	return value != null && (EVENT_PLAN_CODES as string[]).includes(value);
}
