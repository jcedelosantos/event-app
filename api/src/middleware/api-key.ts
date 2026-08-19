import { NextFunction, Request, Response } from 'express';
import { prismaUnscoped } from '../lib/prisma';
import { hashApiKey } from '../lib/api-key';

export interface ApiKeyRequest extends Request {
	apiKeyTenantId?: number;
	apiKeyId?: number;
}

// Auth de la API pública (ver routes/public-api.ts) — paralela a requireAuth (middleware/auth.ts)
// pero para integraciones externas, no para el manager logueado: no hay User ni tenantId en un JWT
// acá, solo una ApiKey resuelta por su hash. Usa prismaUnscoped a propósito, mismo criterio que
// resolver un Tenant por slug/customDomain — antes de este lookup no se sabe a qué tenant pertenece
// la clave, así que no hay tenantId con el que scopear la query.
export async function requireApiKey(req: ApiKeyRequest, res: Response, next: NextFunction) {
	const header = req.headers.authorization;
	const key = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
	if (!key) {
		res.status(401).json({ error: 'Missing Authorization header' });
		return;
	}

	const apiKey = await prismaUnscoped.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });
	if (!apiKey || !apiKey.active) {
		res.status(401).json({ error: 'API key inválida o revocada' });
		return;
	}

	req.apiKeyTenantId = apiKey.tenantId;
	req.apiKeyId = apiKey.id;
	// Fire-and-forget: no bloquea la respuesta por esto, y un fallo acá no debe tumbar el request.
	prismaUnscoped.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch((err) => {
		console.error('requireApiKey: no se pudo actualizar lastUsedAt', err);
	});
	next();
}
