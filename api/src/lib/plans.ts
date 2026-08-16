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
	// Centavos enteros, no dólares (ver lib/money.ts).
	priceCents: number;
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

export const OVERAGE_FEE_PER_PERSON_CENTS = 60;

export const PLANS: Record<PlanCode, PlanDefinition> = {
	BASICO: {
		code: 'BASICO',
		name: 'Básico',
		priceCents: 4900,
		attendeesPerEvent: 50,
		features: { publicPortal: false, advancedReporting: false, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: false },
	},
	INTERMEDIO: {
		code: 'INTERMEDIO',
		name: 'Intermedio',
		priceCents: 9900,
		attendeesPerEvent: 150,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: true },
	},
	AVANZADO: {
		code: 'AVANZADO',
		name: 'Avanzado',
		priceCents: 19900,
		attendeesPerEvent: 500,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
	},
	// Code queda PRO_MAX por retrocompatibilidad (webhooks/env vars de PayPal, filas ya guardadas en
	// Tenant.plan/Subscription.plan lo referencian por este string) — solo cambia el nombre público.
	// priceCents acá es solo de referencia interna (facturas manuales, Super Admin) — YA NO es
	// autoservicio: POST /public/signup rechaza este plan (ver signup.ts), la marketing page no
	// muestra precio para este tier, y el alta la hace un Super Admin a mano tras cotizar.
	PRO_MAX: {
		code: 'PRO_MAX',
		name: 'Pro Enterprise',
		priceCents: 65000,
		attendeesPerEvent: 1000,
		features: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
	},
};

export function isPlanCode(value: string): value is PlanCode {
	return value in PLANS;
}
