import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { formatUploadError, imageUpload } from '../lib/uploads';
import { INVOICE_SETTING_KEYS, InvoiceSettingKey } from '../lib/invoice-config';
import { PLANS, PlanCode } from '../lib/plans';
import { updatePlanPricing } from '../lib/paypal-billing';

// Configuración global de facturación (datos del emisor, banco y secuencia de NCF) — solo el
// Super Admin la ve/edita, nunca un tenant. Mismo patrón clave/valor que settings.ts pero contra
// PlatformSetting (sin tenantId) en vez de AppSetting.
export const platformSettingsRouter = Router();
platformSettingsRouter.use(requireAuth, requireSuperAdmin);

platformSettingsRouter.get('/', asyncHandler(async (_req, res) => {
	const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...INVOICE_SETTING_KEYS] } } });
	const result: Record<string, string> = {};
	for (const key of INVOICE_SETTING_KEYS) result[key] = '';
	for (const row of rows) result[row.key] = row.value;
	res.json(result);
}));

// Logo del emisor para el encabezado de la factura (ver lib/invoice-pdf.ts) — endpoint propio en
// vez de reusar POST /uploads porque ese exige requireTenant y el Super Admin no tiene tenantId.
// Mismo wrapping por Promise que uploads.ts: multer usa un callback, no una promesa, así que
// asyncHandler necesita este puente para no perder un error de subida.
platformSettingsRouter.post(
	'/logo',
	asyncHandler((req, res) => {
		return new Promise<void>((resolve) => {
			imageUpload.single('file')(req, res, (err: unknown) => {
				if (err) {
					res.status(400).json({ error: formatUploadError(err) });
					resolve();
					return;
				}
				if (!req.file) {
					res.status(400).json({ error: 'No se recibió ningún archivo' });
					resolve();
					return;
				}
				res.status(201).json({ url: `/uploads/${req.file.filename}` });
				resolve();
			});
		});
	}),
);

const valueSchema = z.object({ value: z.string().max(500) });

platformSettingsRouter.put('/:key', asyncHandler(async (req, res) => {
	const key = req.params.key as InvoiceSettingKey;
	if (!INVOICE_SETTING_KEYS.includes(key)) {
		res.status(400).json({ error: 'Clave de configuración desconocida' });
		return;
	}
	const parsed = valueSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	if (key === 'invoiceNcfNext' && parsed.data.value !== '' && !/^\d+$/.test(parsed.data.value)) {
		res.status(400).json({ error: 'El próximo NCF debe ser un número' });
		return;
	}
	await prisma.platformSetting.upsert({
		where: { key },
		update: { value: parsed.data.value },
		create: { key, value: parsed.data.value },
	});
	res.json({ ok: true });
}));

// Empuja los priceCents de api/src/lib/plans.ts (fuente de verdad) a los Billing Plans YA CREADOS
// en la cuenta real de PayPal — uno por uno, para poder reportar cuál falló sin que un error corte
// a los demás. Deliberadamente NO toca las suscripciones activas (ver comentario en
// updatePlanPricing): esto solo cambia lo que paga alguien que se suscriba de acá en adelante.
platformSettingsRouter.post(
	'/paypal/sync-pricing',
	asyncHandler(async (_req, res) => {
		const results: Record<PlanCode, { ok: boolean; error?: string }> = {} as any;
		for (const code of Object.keys(PLANS) as PlanCode[]) {
			try {
				await updatePlanPricing(code, PLANS[code].priceCents);
				results[code] = { ok: true };
			} catch (err) {
				results[code] = { ok: false, error: err instanceof Error ? err.message : String(err) };
			}
		}
		res.json(results);
	}),
);
