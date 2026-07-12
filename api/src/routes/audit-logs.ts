import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { toPublicUser } from '../lib/serialize';

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth);

const LIST_LIMIT = 300;

auditLogsRouter.get('/', asyncHandler(async (req, res) => {
	const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
	const logs = await prisma.auditLog.findMany({
		where: entity ? { entity } : undefined,
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
