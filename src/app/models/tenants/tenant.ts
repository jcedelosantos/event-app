export type TenantType = 'GENERAL' | 'CLUB' | 'CHURCH';

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
	_count?: { users: number; events: number };
}
