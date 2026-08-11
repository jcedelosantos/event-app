// Catálogo de tiers "evento único, sin suscripción" (Event-as-a-Service) — mismo criterio que
// lib/plans.ts: es código, no una tabla editable, porque cambia poco. El prefijo `EVENT_` en el
// código es lo que distingue a un tenant de este tipo de uno recurrente (BASICO/INTERMEDIO/
// AVANZADO/PRO_MAX) en cualquier chequeo del resto del backend — ver isEventPlanCode().
//
// Precios en USD, pago único (no recurrente) — son ancla sin validar contra clientes reales,
// mismo criterio ya usado para el catálogo de servicios adicionales (lib/addon-services.ts): se
// ajustan después sin fricción, viven en un solo archivo.

export type EventPlanCode = 'EVENT_100' | 'EVENT_300' | 'EVENT_500' | 'EVENT_1000' | 'EVENT_2500' | 'EVENT_5000';

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	priceUSD: number;
};

export const EVENT_PLANS: Record<EventPlanCode, EventPlanDefinition> = {
	EVENT_100: { code: 'EVENT_100', name: 'Evento único — hasta 100 asistentes', maxAttendees: 100, priceUSD: 79 },
	EVENT_300: { code: 'EVENT_300', name: 'Evento único — hasta 300 asistentes', maxAttendees: 300, priceUSD: 149 },
	EVENT_500: { code: 'EVENT_500', name: 'Evento único — hasta 500 asistentes', maxAttendees: 500, priceUSD: 249 },
	EVENT_1000: { code: 'EVENT_1000', name: 'Evento único — hasta 1,000 asistentes', maxAttendees: 1000, priceUSD: 399 },
	EVENT_2500: { code: 'EVENT_2500', name: 'Evento único — hasta 2,500 asistentes', maxAttendees: 2500, priceUSD: 699 },
	EVENT_5000: { code: 'EVENT_5000', name: 'Evento único — hasta 5,000 asistentes', maxAttendees: 5000, priceUSD: 1200 },
};

export const EVENT_PLAN_CODES = Object.keys(EVENT_PLANS) as EventPlanCode[];

export function isEventPlanCode(value: string | null | undefined): value is EventPlanCode {
	return value != null && value in EVENT_PLANS;
}
