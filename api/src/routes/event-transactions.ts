import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const eventTransactionsRouter = Router();
eventTransactionsRouter.use(requireAuth, requireTenant, requireActiveSubscription, blockScannerRole);

const transactionInputSchema = z.object({
	type: z.enum(['INCOME', 'EXPENSE']),
	category: z.string().min(1),
	description: z.string().optional().default(''),
	amountCents: z.number().int().min(0),
	eventId: z.number().int(),
});

eventTransactionsRouter.get(
	'/',
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const tenantId = req.user!.tenantId!;
		const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
		const transactions = await prisma.eventTransaction.findMany({
			where: eventId ? { eventId, tenantId } : { tenantId },
			orderBy: { createdAt: 'desc' },
		});
		res.json(transactions);
	}),
);

eventTransactionsRouter.post(
	'/',
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const parsed = transactionInputSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}

		const tenantId = req.user!.tenantId!;
		try {
			const created = await prisma.eventTransaction.create({
				data: { ...parsed.data, tenantId, source: 'MANUAL' },
			});
			await logAudit({
				tenantId,
				userId: req.user!.userId,
				action: 'CREATE',
				entity: 'EventTransaction',
				entityId: created.id,
				summary: `Cargó ${created.type === 'INCOME' ? 'un ingreso' : 'un gasto'} de "${created.category}"`,
			});
			res.status(201).json(created);
		} catch (err: any) {
			if (err.code === 'P2003') {
				res.status(400).json({ error: 'El evento indicado no existe' });
				return;
			}
			throw err;
		}
	}),
);

// PUT y DELETE solo tocan líneas MANUAL — las AUTOMATIC las genera/borra sola el hook de
// service-requests.ts cuando cambia el status de la solicitud (ver ese archivo), y dejar
// editarlas/borrarlas desde acá rompería la trazabilidad con la solicitud que las originó.
type ManualOnlyGuardResult = { error: 400 | 404; message: string; existing?: undefined } | { error?: undefined; existing: NonNullable<Awaited<ReturnType<typeof prisma.eventTransaction.findUnique>>> };

const manualOnlyGuard = async (id: number, tenantId: number): Promise<ManualOnlyGuardResult> => {
	const existing = await prisma.eventTransaction.findUnique({ where: { id, tenantId } });
	if (!existing) return { error: 404, message: 'Movimiento no encontrado' };
	if (existing.source !== 'MANUAL') {
		return { error: 400, message: 'Esta línea la generó una solicitud de servicio — editala desde ahí' };
	}
	return { existing };
};

eventTransactionsRouter.put(
	'/:id',
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const id = Number(req.params.id);
		const tenantId = req.user!.tenantId!;
		const parsed = transactionInputSchema.partial().safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}

		const guard = await manualOnlyGuard(id, tenantId);
		if (guard.error !== undefined) {
			res.status(guard.error).json({ error: guard.message });
			return;
		}

		const updated = await prisma.eventTransaction.update({ where: { id, tenantId }, data: parsed.data });
		await logAudit({
			tenantId,
			userId: req.user!.userId,
			action: 'UPDATE',
			entity: 'EventTransaction',
			entityId: id,
			summary: `Editó ${updated.type === 'INCOME' ? 'un ingreso' : 'un gasto'} de "${updated.category}"`,
		});
		res.json(updated);
	}),
);

eventTransactionsRouter.delete(
	'/:id',
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const id = Number(req.params.id);
		const tenantId = req.user!.tenantId!;

		const guard = await manualOnlyGuard(id, tenantId);
		if (guard.error !== undefined) {
			res.status(guard.error).json({ error: guard.message });
			return;
		}

		await prisma.eventTransaction.delete({ where: { id, tenantId } });
		await logAudit({
			tenantId,
			userId: req.user!.userId,
			action: 'DELETE',
			entity: 'EventTransaction',
			entityId: id,
			summary: `Borró ${guard.existing.type === 'INCOME' ? 'un ingreso' : 'un gasto'} de "${guard.existing.category}"`,
		});
		res.status(204).send();
	}),
);
