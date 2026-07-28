import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { verifyToken } from '../lib/jwt';
import { asyncHandler } from '../lib/async-handler';

export const settingsRouter = Router();

// Lectura pública a propósito: son valores de branding (ej. color de acento), no datos sensibles, y
// así el picker público y la pantalla de login también los reflejan sin necesitar sesión. Como ahora
// cada tenant tiene su propio color, se intenta leer el token si viene uno (sesión ya iniciada) para
// mostrar el color de ESE tenant; sin token (ej. login/picker antes de loguearse) no hay forma de
// saber a qué tenant pertenece la visita, así que se responde vacío y el frontend cae al color
// default — no es una regresión real hoy porque el único tenant existente ya usa ese mismo default.
settingsRouter.get('/', asyncHandler(async (req, res) => {
	const header = req.headers.authorization;
	const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
	let tenantId: number | null = null;
	if (token) {
		try {
			tenantId = verifyToken(token).tenantId;
		} catch {
			tenantId = null;
		}
	}
	if (tenantId == null) {
		res.json({});
		return;
	}
	const settings = await prisma.appSetting.findMany({ where: { tenantId } });
	// Keys que terminan en "Secret" o "WebhookId" (ej. payments.paypalSecret) nunca salen por acá,
	// ni siquiera a un manager logueado de su propio tenant — son credenciales que solo el backend
	// necesita leer (ver lib/paypal.ts), no algo para reflejar de vuelta al navegador. En su lugar se
	// manda un flag booleano "<key>Configured" para que el form de Settings pueda mostrar "••••
	// configurado" sin depender de releer el valor real.
	const result: Record<string, string> = {};
	for (const s of settings) {
		if (s.key.endsWith('Secret') || s.key.endsWith('WebhookId')) {
			result[`${s.key}Configured`] = 'true';
		} else {
			result[s.key] = s.value;
		}
	}
	res.json(result);
}));

const valueSchema = z.object({ value: z.string().min(1).max(200) });

settingsRouter.put('/:key', requireAuth, requireTenant, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = valueSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	const key = req.params.key;
	const setting = await prisma.appSetting.upsert({
		where: { tenantId_key: { tenantId, key } },
		update: { value: parsed.data.value },
		create: { tenantId, key, value: parsed.data.value },
	});
	res.json(setting);
}));
