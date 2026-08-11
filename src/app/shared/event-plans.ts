// Copia frontend de api/src/lib/event-plans.ts — este repo no es un monorepo con paths
// compartidos entre api/ y el Angular de acá arriba, así que no hay forma de importar ese archivo
// directo (mismo comentario que pricing-plans.ts). Si un precio cambia, hay que replicarlo a mano
// en los dos lados.

export type EventPlanCode = 'EVENT_100' | 'EVENT_300' | 'EVENT_500' | 'EVENT_1000' | 'EVENT_2500' | 'EVENT_5000';

export type EventPlanDefinition = {
	code: EventPlanCode;
	name: string;
	maxAttendees: number;
	priceUSD: number;
};

const EVENT_PLAN_CODES: EventPlanCode[] = ['EVENT_100', 'EVENT_300', 'EVENT_500', 'EVENT_1000', 'EVENT_2500', 'EVENT_5000'];

export function isEventPlanCode(value: string | null | undefined): value is EventPlanCode {
	return value != null && (EVENT_PLAN_CODES as string[]).includes(value);
}

// USD 1 por asistente incluido — si el tenant vende por encima del tope no se bloquea, se cobra
// overage a EVENT_OVERAGE_FEE_PER_PERSON_USD por persona (ver api/src/lib/overage.ts).
const PRICE_PER_ATTENDEE_USD = 1;
export const EVENT_OVERAGE_FEE_PER_PERSON_USD = 1.25;

function definePlan(code: EventPlanCode, maxAttendees: number): EventPlanDefinition {
	return { code, name: `Hasta ${maxAttendees.toLocaleString('es-DO')} asistentes`, maxAttendees, priceUSD: maxAttendees * PRICE_PER_ATTENDEE_USD };
}

export const EVENT_PLANS: EventPlanDefinition[] = [
	definePlan('EVENT_100', 100),
	definePlan('EVENT_300', 300),
	definePlan('EVENT_500', 500),
	definePlan('EVENT_1000', 1000),
	definePlan('EVENT_2500', 2500),
	definePlan('EVENT_5000', 5000),
];
