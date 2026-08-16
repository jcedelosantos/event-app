import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requirePlan } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { toPublicUser } from '../lib/serialize';

export const auditLogsRouter = Router();
// Reportería y auditoría es una feature de Intermedio para arriba (ver plan económico) — Básico no
// la incluye.
auditLogsRouter.use(requireAuth, requireTenant, blockScannerRole, requirePlan('advancedReporting'));

const LIST_LIMIT = 300;

auditLogsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
	const where = entity ? { entity, tenantId } : { tenantId };
	const [logs, totalCount] = await Promise.all([
		prisma.auditLog.findMany({ where, include: { user: { include: { type: true } } }, orderBy: { id: 'desc' }, take: LIST_LIMIT }),
		prisma.auditLog.count({ where }),
	]);
	res.setHeader('X-Total-Count', String(totalCount));
	res.json(
		logs.map(({ user, ...log }) => ({
			...log,
			user: user ? toPublicUser(user) : null,
		})),
	);
}));
