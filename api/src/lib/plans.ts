// Fuente de verdad de los 4 planes de suscripción (ver plan económico) — usado por el script de
// setup de PayPal Billing Plans, por el middleware de feature-gating, y por el endpoint público de
// alta. El frontend (src/app/shared/pricing-plans.ts) mantiene su PROPIA copia para la página de
// marketing: este repo no es un monorepo con paths compartidos entre api/ y el Angular de arriba,
// así que no hay forma de importar este archivo desde el frontend sin reestructurar el proyecto —
// si algún precio/cupo cambia acá, hay que replicarlo a mano allá (mismo comentario en ambos lados).

export type PlanCode = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'PRO_MAX';

export type PlanDefinition = {
	code: PlanCode;
	name: string;
	priceUSD: number;
	// Asistentes reales incluidos POR EVENTO (no acumulado mensual, no cantidad de eventos — ver
	// middleware/plan.ts) — arriba de esto se acumula overage a $0.60/persona, sin cobro automático.
	attendeesPerEvent: number;
	features: {
		publicPortal: boolean;
		advancedReporting: boolean;
		onlinePayment: boolean;
		waitingRoomAndCapacity: boolean;
		productsModule: boolean;
	};
};

export const OVERAGE_FEE_PER_PERSON_USD = 0.6;

export const PLANS: Record<PlanCode, PlanDefinition> = {
	BASICO: {
		code: 'BASICO',
		name: 'Básico',
		priceUSD: 49,
		attendeesPerEvent: 50,
		features: { publicPortal: false, advancedReporting: false, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: false },
	},
	INTERMEDIO: {
		code: 'INTERMEDIO',
		name: 'Intermedio',
		priceUSD: 99,
		attendeesPerEvent: 150,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: true },
	},
	AVANZADO: {
		code: 'AVANZADO',
		name: 'Avanzado',
		priceUSD: 199,
		attendeesPerEvent: 500,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
	},
	// Code queda PRO_MAX por retrocompatibilidad (webhooks/env vars de PayPal, filas ya guardadas en
	// Tenant.plan/Subscription.plan lo referencian por este string) — solo cambia el nombre público.
	// Precio = piso de la banda "Enterprise, cotización desde $650" del tarifario comercial — sigue
	// siendo autoservicio a este precio, pero cualquier necesidad custom (multi-sede, API, SLA,
	// white label completo) se negocia por encima de este piso, no es parte del checkout automático.
	PRO_MAX: {
		code: 'PRO_MAX',
		name: 'Pro Enterprise',
		priceUSD: 650,
		attendeesPerEvent: 1000,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
	},
};

export function isPlanCode(value: string): value is PlanCode {
	return value in PLANS;
}
