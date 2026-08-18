export interface Location {
	id: number;
	name: string;
	address: string | null;
	active: boolean;
	createdAt: string;
	tenantId: number;
}
