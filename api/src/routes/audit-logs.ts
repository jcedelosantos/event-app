import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { toPublicUser } from '../lib/serialize';

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth, requireTenant);

const LIST_LIMIT = 300;

auditLogsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
	const logs = await prisma.auditLog.findMany({
		where: entity ? { entity, tenantId } : { tenantId },
		include: { user: { include: { type: true } } },
		orderBy: { id: 'desc' },
		take: LIST_LIMIT,
	});
	res.json(
		logs.map(({ user, ...log }) => ({
			...log,
			user: user ? toPublicUser(user) : null,
		})),
	);
}));
