// Copia frontend de api/src/lib/plans.ts — este repo no es un monorepo con paths compartidos entre
// api/ y el Angular de acá arriba, así que no hay forma de importar ese archivo directo. Si un
// precio o cupo cambia, hay que replicarlo a mano en los dos lados (mismo comentario en ambos).

export type PlanCode = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'PRO_MAX';

export type PricingPlan = {
	code: PlanCode;
	name: string;
	priceUSD: number;
	attendeesPerEvent: number;
	highlighted?: boolean;
	features: string[];
};

// Espejo de api/src/lib/plans.ts PlanDefinition['features'] — usado por el sidebar (nav-bar-menu)
// para decidir qué secciones mostrar según el plan del tenant. Mismo comentario que arriba: hay que
// mantenerlo a mano en sync con el backend.
export type PlanFeatures = {
	publicPortal: boolean;
	advancedReporting: boolean;
	onlinePayment: boolean;
	waitingRoomAndCapacity: boolean;
	productsModule: boolean;
};

export const PLAN_FEATURES: Record<PlanCode, PlanFeatures> = {
	BASICO: { publicPortal: false, advancedReporting: false, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: false },
	INTERMEDIO: { publicPortal: true, advancedReporting: true, onlinePayment: false, waitingRoomAndCapacity: false, productsModule: true },
	AVANZADO: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
	PRO_MAX: { publicPortal: true, advancedReporting: true, onlinePayment: true, waitingRoomAndCapacity: true, productsModule: true },
};

export const PRICING_PLANS: PricingPlan[] = [
	{
		code: 'BASICO',
		name: 'Básico',
		priceUSD: 19,
		attendeesPerEvent: 50,
		features: ['Eventos ilimitados por mes', 'Hasta 50 asistentes por evento', 'Creación de eventos, mapas y asientos', 'Venta manual + scanner de check-in', 'Panel de QRs y correo automático'],
	},
	{
		code: 'INTERMEDIO',
		name: 'Intermedio',
		priceUSD: 49,
		attendeesPerEvent: 150,
		highlighted: true,
		features: ['Todo lo de Básico', 'Hasta 150 asistentes por evento', 'Portal público de auto-registro', 'Reportería y auditoría avanzada', 'Venta de productos / comida del día'],
	},
	{
		code: 'AVANZADO',
		name: 'Avanzado',
		priceUSD: 99,
		attendeesPerEvent: 500,
		features: ['Todo lo de Intermedio', 'Hasta 500 asistentes por evento', 'Cobro online (PayPal / link de pago)', 'Sala de espera virtual', 'Aforo e invitados con nombre propio'],
	},
	{
		code: 'PRO_MAX',
		name: 'Pro Max',
		priceUSD: 149,
		attendeesPerEvent: 1000,
		features: ['Todo lo de Avanzado', 'Hasta 1,000 asistentes por evento', 'Integración con base de datos externa (setup aparte)'],
	},
];

// Lookup directo por código — usado por la pantalla de suscripción del manager (a diferencia de
// PRICING_PLANS, pensado para recorrerse en orden en la página de marketing).
export const PLANS_BY_CODE: Record<PlanCode, PricingPlan> = Object.fromEntries(PRICING_PLANS.map((p) => [p.code, p])) as Record<PlanCode, PricingPlan>;

export const OVERAGE_FEE_PER_PERSON_USD = 0.6;
