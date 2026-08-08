export interface ScanConflict {
	id: number;
	entityType: 'SaleTicket' | 'SaleProduct' | 'Child';
	entityId: number;
	codeQR: string;
	// ISO — la hora real del escaneo que perdió la reconciliación offline (ver POST /scan/sync).
	attemptedAt: string;
	createdAt: string;
	resolvedAt: string | null;
	accessPoint?: { id: number; name: string } | null;
	// Resueltos server-side (GET /scan/conflicts) — "Nombre — asiento/producto" y a qué evento
	// pertenece, para no mostrar un codeQR pelado que no dice nada por sí solo.
	summary: string;
	event: { id: number; name: string } | null;
}
