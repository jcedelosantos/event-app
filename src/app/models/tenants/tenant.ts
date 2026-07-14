export type TenantType = 'GENERAL' | 'CLUB' | 'CHURCH';

export interface Tenant {
	id: number;
	name: string;
	slug: string;
	active: boolean;
	type: TenantType;
	createdAt: string;
	_count?: { users: number; events: number };
}
