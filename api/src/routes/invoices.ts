import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

// De solo lectura a propósito — el tenant NUNCA genera su propia factura (eso sigue siendo
// exclusivo del Super Admin, ver routes/tenants.ts GET /:id/invoice), acá solo consulta lo que ya
// se le emitió. Sin requireActiveSubscription: un tenant en modo consulta (EVENT_ENDED,
// PENDING_REVIEW, etc.) igual tiene que poder ver/descargar sus facturas viejas.
export const invoicesRouter = Router();
invoicesRouter.use(requireAuth, requireTenant, blockScannerRole);

invoicesRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	// status !== GENERATED (PENDING/FAILED, ver lib/invoice-generation.ts) es un artefacto interno
	// de una emisión que no terminó de completarse — el tenant nunca debería ver una fila sin PDF.
	const invoices = await prisma.invoice.findMany({ where: { tenantId, status: 'GENERATED' }, orderBy: { createdAt: 'desc' } });
	res.json(invoices);
}));
