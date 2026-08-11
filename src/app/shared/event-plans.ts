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

export const EVENT_PLANS: EventPlanDefinition[] = [
	{ code: 'EVENT_100', name: 'Hasta 100 asistentes', maxAttendees: 100, priceUSD: 79 },
	{ code: 'EVENT_300', name: 'Hasta 300 asistentes', maxAttendees: 300, priceUSD: 149 },
	{ code: 'EVENT_500', name: 'Hasta 500 asistentes', maxAttendees: 500, priceUSD: 249 },
	{ code: 'EVENT_1000', name: 'Hasta 1,000 asistentes', maxAttendees: 1000, priceUSD: 399 },
	{ code: 'EVENT_2500', name: 'Hasta 2,500 asistentes', maxAttendees: 2500, priceUSD: 699 },
	{ code: 'EVENT_5000', name: 'Hasta 5,000 asistentes', maxAttendees: 5000, priceUSD: 1200 },
];
