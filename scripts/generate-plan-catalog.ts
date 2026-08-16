// Genera src/app/shared/plan-catalog.generated.ts a partir de api/src/lib/plans.ts y
// api/src/lib/event-plans.ts — así el frontend deja de tener una copia a mano de precios/cupos que
// puede desincronizarse del backend (ver revisión 9 de código). Se corre solo, antes de cada
// build/start (ver prebuild/prestart en package.json).

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLANS, OVERAGE_FEE_PER_PERSON_CENTS } from '../api/src/lib/plans';
import { EVENT_PLANS, EVENT_OVERAGE_FEE_PER_PERSON_CENTS } from '../api/src/lib/event-plans';

const planCatalog = Object.values(PLANS).map(({ code, name, priceCents, attendeesPerEvent, features }) => ({
	code,
	name,
	priceCents,
	attendeesPerEvent,
	features,
}));

const eventPlanCatalog = Object.values(EVENT_PLANS).map(({ code, name, priceCents, maxAttendees }) => ({
	code,
	name,
	priceCents,
	maxAttendees,
}));

const contents = `// GENERADO AUTOMÁTICAMENTE desde api/src/lib/plans.ts y api/src/lib/event-plans.ts — no editar a
// mano, se sobrescribe en cada build/start (ver scripts/generate-plan-catalog.ts). Única fuente
// real de precios/cupos/features: el backend.

export type PlanCode = ${Object.keys(PLANS)
	.map((c) => `'${c}'`)
	.join(' | ')};

export type PlanFeatures = {
	publicPortal: boolean;
	advancedReporting: boolean;
	onlinePayment: boolean;
	waitingRoomAndCapacity: boolean;
	productsModule: boolean;
};

export type PlanCatalogEntry = {
	code: PlanCode;
	name: string;
	priceCents: number;
	attendeesPerEvent: number;
	features: PlanFeatures;
};

export const OVERAGE_FEE_PER_PERSON_CENTS = ${OVERAGE_FEE_PER_PERSON_CENTS};

export const PLAN_CATALOG: PlanCatalogEntry[] = ${JSON.stringify(planCatalog, null, '\t')};

export type EventPlanCode = ${Object.keys(EVENT_PLANS)
	.map((c) => `'${c}'`)
	.join(' | ')};

export type EventPlanCatalogEntry = {
	code: EventPlanCode;
	name: string;
	priceCents: number;
	maxAttendees: number;
};

export const EVENT_OVERAGE_FEE_PER_PERSON_CENTS = ${EVENT_OVERAGE_FEE_PER_PERSON_CENTS};

export const EVENT_PLAN_CATALOG: EventPlanCatalogEntry[] = ${JSON.stringify(eventPlanCatalog, null, '\t')};
`;

const outPath = resolve(process.cwd(), 'src/app/shared/plan-catalog.generated.ts');
writeFileSync(outPath, contents, 'utf-8');
console.log(`plan-catalog.generated.ts escrito (${planCatalog.length} planes, ${eventPlanCatalog.length} tiers de evento único)`);
