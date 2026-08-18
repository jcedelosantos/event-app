export type InvoiceGeneratedBy = 'MANUAL' | 'AUTO' | 'WELCOME';

// GENERATED (default histórico, la única que /invoices le devuelve al tenant) | PENDING/FAILED —
// artefactos internos de una emisión que no terminó de completarse, ver lib/invoice-generation.ts
// en la API. Solo se ven en las respuestas de Super Admin (GET /tenants/:id/invoices y GET
// /tenants/invoices).
export type InvoiceStatus = 'PENDING' | 'GENERATED' | 'FAILED';

export interface Invoice {
	id: number;
	tenantId: number;
	invoiceNumber: string;
	ncf: string | null;
	billingPeriod: string;
	planCode: string | null;
	// Centavos enteros, no dólares (ver api/src/lib/money.ts).
	planPriceCents: number;
	overageCents: number;
	totalCents: number;
	// null solo en status PENDING/FAILED — el tenant nunca ve esas filas (ver routes/invoices.ts).
	pdfUrl: string | null;
	status: InvoiceStatus;
	generatedBy: InvoiceGeneratedBy;
	createdAt: string;
	// Solo viene poblado en GET /tenants/invoices (listado global de Super Admin) — el endpoint
	// por-tenant (GET /tenants/:id/invoices) y el del tenant mismo no lo necesitan.
	tenant?: { id: number; name: string };
}
