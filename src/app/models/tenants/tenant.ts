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

export interface Tenant {
	id: number;
	name: string;
	slug: string;
	active: boolean;
	type: TenantType;
	createdAt: string;
	// null = tenant sin suscripción propia (dado de alta a mano antes de que existiera este
	// sistema) — ver middleware/plan.ts en la API.
	plan: string | null;
	planStatus: string | null;
	// Datos fiscales/de contacto para el bloque "Para" de la factura (ver invoice-pdf.ts en la API).
	rnc: string | null;
	address: string | null;
	phone: string | null;
	_count?: { users: number; events: number };
}
