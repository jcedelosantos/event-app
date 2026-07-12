import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';

export const settingsRouter = Router();

// Lectura pública a propósito: son valores de branding (ej. color de acento), no datos sensibles,
// y así el picker público también podría reflejarlos sin necesitar login.
settingsRouter.get('/', asyncHandler(async (_req, res) => {
	const settings = await prisma.appSetting.findMany();
	res.json(Object.fromEntries(settings.map((s) => [s.key, s.value])));
}));

const valueSchema = z.object({ value: z.string().min(1).max(200) });

settingsRouter.put('/:key', requireAuth, asyncHandler(async (req, res) => {
	const parsed = valueSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const key = req.params.key;
	const setting = await prisma.appSetting.upsert({
		where: { key },
		update: { value: parsed.data.value },
		create: { key, value: parsed.data.value },
	});
	res.json(setting);
}));
