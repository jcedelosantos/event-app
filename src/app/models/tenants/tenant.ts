export interface Tenant {
	id: number;
	name: string;
	slug: string;
	active: boolean;
	createdAt: string;
	_count?: { users: number; events: number };
}
