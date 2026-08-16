export type InvoiceGeneratedBy = 'MANUAL' | 'AUTO' | 'WELCOME';

// GENERATED (default histórico, la única que /invoices le devuelve al tenant) | PENDING/FAILED —
// artefactos internos de una emisión que no terminó de completarse, ver lib/invoice-generation.ts
// en la API. Solo se ven en la respuesta de Super Admin (GET /tenants/:id/invoices, sin frontend
// propio todavía).
export type InvoiceStatus = 'PENDING' | 'GENERATED' | 'FAILED';

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
	// null solo en status PENDING/FAILED — el tenant nunca ve esas filas (ver routes/invoices.ts).
	pdfUrl: string | null;
	status: InvoiceStatus;
	generatedBy: InvoiceGeneratedBy;
	createdAt: string;
}
