export type InvoiceGeneratedBy = 'MANUAL' | 'AUTO';

export interface Invoice {
	id: number;
	tenantId: number;
	invoiceNumber: string;
	ncf: string | null;
	billingPeriod: string;
	planCode: string | null;
	planPriceUSD: number;
	overageUSD: number;
	totalUSD: number;
	pdfUrl: string;
	generatedBy: InvoiceGeneratedBy;
	createdAt: string;
}
