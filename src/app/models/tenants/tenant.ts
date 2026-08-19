export type TenantType = 'GENERAL' | 'CLUB' | 'CHURCH' | 'ONG' | 'PRIVADA' | 'PUBLICA' | 'INDEPENDIENTE';

export const TENANT_TYPE_LABELS: Record<TenantType, string> = {
	GENERAL: 'General',
	CLUB: 'Club',
	CHURCH: 'Iglesia',
	ONG: 'ONG',
	PRIVADA: 'Empresa privada',
	PUBLICA: 'Institución pública',
	INDEPENDIENTE: 'Independiente',
};

export type PlanCode = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'PRO_MAX';

export const PLAN_CODE_LABELS: Record<PlanCode, string> = {
	BASICO: 'Básico',
	INTERMEDIO: 'Intermedio',
	AVANZADO: 'Avanzado',
	PRO_MAX: 'Pro Enterprise',
};

export interface Tenant {
	id: number;
	name: string;
	slug: string;
	active: boolean;
	type: TenantType;
	createdAt: string;
	// null = tenant sin suscripción propia (dado de alta a mano antes de que existiera este
	// sistema, o creado sin plan todavía) — ver middleware/plan.ts en la API.
	plan: string | null;
	planStatus: string | null;
	// Datos fiscales/de contacto para el bloque "Para" de la factura (ver invoice-pdf.ts en la API).
	rnc: string | null;
	address: string | null;
	phone: string | null;
	// Dominio propio (ver Tenant.customDomain en la API) — null = sin dominio propio, portal público
	// solo accesible en integ.cedanet.net/o/:slug.
	customDomain: string | null;
	_count?: { users: number; events: number };
}
