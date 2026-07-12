import { User } from '../users/user';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLog {
	id: number;
	userId: number | null;
	user: User | null;
	action: AuditAction;
	entity: string;
	entityId: number;
	summary: string;
	createdAt: string;
}
