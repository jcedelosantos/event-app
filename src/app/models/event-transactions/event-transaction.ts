export type EventTransactionType = 'INCOME' | 'EXPENSE';
export type EventTransactionSource = 'MANUAL' | 'AUTOMATIC';

export interface EventTransaction {
	id: number;
	type: EventTransactionType;
	category: string;
	description: string;
	amountCents: number;
	source: EventTransactionSource;
	eventId: number;
	tenantId: number;
	serviceRequestId: number | null;
	createdAt: string;
	updatedAt: string;
}
