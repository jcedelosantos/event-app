import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription, requirePlan } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';
import { generateApiKey } from '../lib/api-key';

// Panel del manager para administrar sus propias API keys (ver lib/api-key.ts y
// middleware/api-key.ts para la autenticación de la API pública en sí, routes/public-api.ts).
// requirePlan('apiAccess') se aplica por-ruta (no a nivel router) — ver el DELETE más abajo, que
// deliberadamente lo deja afuera para no dejar a un tenant que baje de plan sin forma de apagar una
// clave que ya tenía activa.
export const apiKeysRouter = Router();
apiKeysRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

const createApiKeySchema = z.object({ name: z.string().min(1).max(100) });

// Nunca se selecciona keyHash acá — no hay ningún motivo legítimo para que vuelva del backend una
// vez guardado (ver comentario en el modelo, mismo criterio que Subscription.claimTokenHash).
const listSelect = { id: true, name: true, keyPrefix: true, active: true, createdAt: true, lastUsedAt: true, revokedAt: true } as const;

// Sin requirePlan acá a propósito — igual que el DELETE de abajo, un tenant que bajó de plan
// todavía tiene que poder VER sus claves existentes para poder revocarlas.
apiKeysRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const apiKeys = await prisma.apiKey.findMany({ where: { tenantId }, select: listSelect, orderBy: { createdAt: 'desc' } });
	res.json(apiKeys);
}));

// La única vez que el valor en texto plano de la clave existe en algún lado fuera de la cabeza del
// usuario: se devuelve una sola vez en esta respuesta y se descarta — el backend nunca guarda más
// que el hash (ver generateApiKey), así que no hay forma de recuperarla después, ni para el propio
// Super Admin.
apiKeysRouter.post('/', requirePlan('apiAccess'), asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = createApiKeySchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	const { plainKey, keyHash, keyPrefix } = generateApiKey();
	const created = await prisma.apiKey.create({ data: { tenantId, name: parsed.data.name, keyHash, keyPrefix } });
	await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'ApiKey', entityId: created.id, summary: `Generó la API key "${created.name}"` });
	res.status(201).json({ id: created.id, name: created.name, keyPrefix: created.keyPrefix, createdAt: created.createdAt, key: plainKey });
}));

// Revocar (no borrar): mantiene el registro para auditoría de qué clave existió y cuándo se apagó —
// requireApiKey ya rechaza cualquier clave con active=false, así que esto la desactiva de inmediato.
// Deliberadamente SIN requirePlan('apiAccess') — un tenant que bajó de plan con una clave todavía
// activa tiene que poder apagarla igual.
apiKeysRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	try {
		const revoked = await prisma.apiKey.update({ where: { id, tenantId }, data: { active: false, revokedAt: new Date() } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'ApiKey', entityId: id, summary: `Revocó la API key "${revoked.name}"` });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'API key no encontrada' });
			return;
		}
		throw err;
	}
}));
