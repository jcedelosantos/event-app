// Precio/cupo/features de los 4 planes recurrentes ya NO se copian a mano acá — vienen de
// plan-catalog.generated.ts, generado automáticamente desde api/src/lib/plans.ts en cada
// build/start (ver scripts/generate-plan-catalog.ts, revisión 9 de código). Lo único que sigue
// siendo contenido propio de este archivo es el copy de marketing (descripción larga, bullets,
// qué plan viene destacado) — eso no tiene una "fuente de verdad" en el backend.

import { PLAN_CATALOG, OVERAGE_FEE_PER_PERSON_CENTS, type PlanCode, type PlanFeatures } from './plan-catalog.generated';

export type { PlanCode, PlanFeatures };
export { OVERAGE_FEE_PER_PERSON_CENTS };

export type PricingPlan = {
	code: PlanCode;
	// Centavos enteros, no dólares (ver shared/money.ts).
	priceCents: number;
	name: string;
	attendeesPerEvent: number;
	highlighted?: boolean;
	features: string[];
	// Texto largo para el detalle expandido del plan en la portada (ver site-web.component.ts) — no
	// se usa en la tarjeta chica, solo al hacer click para ampliar.
	description: string;
};

// Usado por el sidebar (nav-bar-menu) para decidir qué secciones mostrar según el plan del tenant.
export const PLAN_FEATURES: Record<PlanCode, PlanFeatures> = Object.fromEntries(PLAN_CATALOG.map((p) => [p.code, p.features])) as Record<PlanCode, PlanFeatures>;

const PLAN_COPY: Record<PlanCode, Pick<PricingPlan, 'features' | 'description' | 'highlighted'>> = {
	BASICO: {
		features: ['Eventos ilimitados por mes', 'Hasta 75 asistentes por evento', 'Creación de eventos, mapas y asientos', 'Venta manual + scanner de check-in', 'Panel de QRs y correo automático'],
		description: 'Ideal para clubes y organizaciones que recién empiezan a digitalizar sus eventos — todo lo esencial para vender entradas y controlar el acceso, sin complicarte.',
	},
	INTERMEDIO: {
		highlighted: true,
		features: ['Todo lo de Básico', 'Hasta 200 asistentes por evento', 'Portal público de auto-registro', 'Reportería y auditoría avanzada', 'Venta de productos / comida del día'],
		description: 'Para organizaciones que ya venden entradas seguido y quieren que sus socios se registren solos, además de entender mejor qué está pasando con reportes y auditoría.',
	},
	AVANZADO: {
		features: ['Todo lo de Intermedio', 'Hasta 500 asistentes por evento', 'Cobro online (PayPal / link de pago)', 'Sala de espera virtual', 'Aforo e invitados con nombre propio'],
		description: 'Pensado para eventos grandes: cobro online, sala de espera virtual, y control fino de aforo e invitados con nombre propio.',
	},
	// Sin autoservicio: la marketing page (site-web.component.ts) no muestra priceCents para este
	// tier y el signup público lo rechaza (ver POST /public/signup) — lo activa un Super Admin a
	// mano tras cotizar.
	PRO_MAX: {
		features: ['Todo lo de Avanzado', 'Hasta 1,000 asistentes por evento', 'Multi-sede: varias sucursales bajo una cuenta', 'Dominio propio (white label completo)', 'API pública para tu propio sistema'],
		description: 'Para operaciones grandes con varias sucursales o necesidades a medida — multi-sede, dominio propio y API pública ya incluidos. Nuestro equipo cotiza el alcance exacto y activa tu cuenta directamente.',
	},
};

export const PRICING_PLANS: PricingPlan[] = PLAN_CATALOG.map((p) => ({
	code: p.code,
	name: p.name,
	priceCents: p.priceCents,
	attendeesPerEvent: p.attendeesPerEvent,
	...PLAN_COPY[p.code],
}));

// Lookup directo por código — usado por la pantalla de suscripción del manager (a diferencia de
// PRICING_PLANS, pensado para recorrerse en orden en la página de marketing).
export const PLANS_BY_CODE: Record<PlanCode, PricingPlan> = Object.fromEntries(PRICING_PLANS.map((p) => [p.code, p])) as Record<PlanCode, PricingPlan>;
