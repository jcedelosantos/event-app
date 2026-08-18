import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription, requirePlan } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const locationsRouter = Router();
locationsRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

const locationInputSchema = z.object({
	name: z.string().min(1),
	address: z.string().optional().nullable(),
	active: z.boolean().optional().default(true),
});

locationsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const locations = await prisma.location.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
	res.json(locations);
}));

// Gateada por plan solo la creación (Enterprise/PRO_MAX) — no las lecturas ni el uso de una sede ya
// asignada, para no dejar huérfano a un tenant que baje de plan después de haber usado la feature.
locationsRouter.post('/', requirePlan('multiLocation'), asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = locationInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	try {
		const created = await prisma.location.create({ data: { ...parsed.data, tenantId } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'Location', entityId: created.id, summary: `Creó la sede "${created.name}"` });
		res.status(201).json(created);
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(400).json({ error: 'Ya existe una sede con ese nombre' });
			return;
		}
		throw err;
	}
}));

locationsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = locationInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const updated = await prisma.location.update({ where: { id, tenantId }, data: parsed.data });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'Location', entityId: id, summary: `Editó la sede "${updated.name}"` });
		res.json(updated);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Sede no encontrada' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(400).json({ error: 'Ya existe una sede con ese nombre' });
			return;
		}
		throw err;
	}
}));

locationsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	try {
		const location = await prisma.location.delete({ where: { id, tenantId } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'DELETE', entity: 'Location', entityId: id, summary: `Borró la sede "${location.name}"` });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Sede no encontrada' });
			return;
		}
		// P2003 = FK constraint — hay Event/User todavía apuntando a esta sede. Desactivar en vez de
		// borrar es la salida (mismo patrón que Event.active) en vez de forzar la reasignación acá.
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'No se puede borrar: hay eventos o usuarios asignados a esta sede. Desactívala en vez de borrarla.' });
			return;
		}
		throw err;
	}
}));
