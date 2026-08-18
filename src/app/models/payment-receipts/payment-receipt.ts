export type PaymentReceiptStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// Histórico de comprobantes de transferencia bancaria (ver api/prisma/schema.prisma, modelo
// PaymentReceipt) — puramente aditivo junto a Tenant.paymentReceiptUrl, que sigue siendo la
// fuente de verdad para el gate de planStatus === PENDING_REVIEW.
export interface PaymentReceipt {
	id: number;
	tenantId: number;
	tenant: { id: number; name: string };
	url: string;
	planCode: string;
	// Centavos enteros, no dólares (ver shared/money.ts) — snapshot del precio del plan al
	// momento del submit.
	amountCents: number;
	status: PaymentReceiptStatus;
	submittedAt: string;
	reviewedAt: string | null;
	reviewNote: string | null;
}
