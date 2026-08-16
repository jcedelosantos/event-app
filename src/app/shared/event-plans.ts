// Copia frontend de api/src/lib/event-plans.ts — este repo no es un monorepo con paths
// compartidos entre api/ y el Angular de acá arriba, así que no hay forma de importar ese archivo
// directo (mismo comentario que pricing-plans.ts). Si un precio cambia, hay que replicarlo a mano
// en los dos lados.

export type EventPlanCode = 'EVENT_100' | 'EVENT_300' | 'EVENT_500' | 'EVENT_1000' | 'EVENT_2500' | 'EVENT_5000';

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	// Centavos enteros, no dólares (ver shared/money.ts).
	priceCents: number;
};

const EVENT_PLAN_CODES: EventPlanCode[] = ['EVENT_100', 'EVENT_300', 'EVENT_500', 'EVENT_1000', 'EVENT_2500', 'EVENT_5000'];

export function isEventPlanCode(value: string | null | undefined): value is EventPlanCode {
	return value != null && (EVENT_PLAN_CODES as string[]).includes(value);
}

// USD 1 por asistente incluido — si el tenant vende por encima del tope no se bloquea, se cobra
// overage a EVENT_OVERAGE_FEE_PER_PERSON_CENTS por persona (ver api/src/lib/overage.ts).
const PRICE_PER_ATTENDEE_CENTS = 100;
export const EVENT_OVERAGE_FEE_PER_PERSON_CENTS = 125;

function definePlan(code: EventPlanCode, maxAttendees: number): EventPlanDefinition {
	return { code, name: `Hasta ${maxAttendees.toLocaleString('es-DO')} asistentes`, maxAttendees, priceCents: maxAttendees * PRICE_PER_ATTENDEE_CENTS };
}

export const EVENT_PLANS: EventPlanDefinition[] = [
	definePlan('EVENT_100', 100),
	definePlan('EVENT_300', 300),
	definePlan('EVENT_500', 500),
	definePlan('EVENT_1000', 1000),
	definePlan('EVENT_2500', 2500),
	definePlan('EVENT_5000', 5000),
];
