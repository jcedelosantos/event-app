import { Router } from 'express';
import { z } from 'zod';
import { prismaUnscoped } from '../lib/prisma';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { sendEnterpriseLeadNotification } from '../lib/mail';

// Contacto público del plan Pro Enterprise (sin autoservicio, ver lib/plans.ts) — mismo criterio de
// auth por ruta que service-requests.ts: el alta es pública (nadie tiene cuenta todavía), la lectura
// y el seguimiento son solo del Super Admin. Sin tenantId en ningún lado — el prospecto no es
// cliente hasta que el Super Admin cierra el acuerdo y lo da de alta por el flujo normal.
export const enterpriseLeadsRouter = Router();

const createLeadSchema = z.object({
	orgName: z.string().min(1),
	contactName: z.string().min(1),
	email: z.string().email(),
	phone: z.string().optional().default(''),
	message: z.string().optional().default(''),
});

enterpriseLeadsRouter.post(
	'/',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = createLeadSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}

		const lead = await prismaUnscoped.enterpriseLead.create({ data: parsed.data });

		sendEnterpriseLeadNotification(parsed.data).catch((err) => console.error('[enterprise-leads] No se pudo enviar el aviso por correo:', err));

		res.status(201).json(lead);
	}),
);

enterpriseLeadsRouter.get(
	'/',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (_req, res) => {
		const leads = await prismaUnscoped.enterpriseLead.findMany({ orderBy: { createdAt: 'desc' } });
		res.json(leads);
	}),
);

enterpriseLeadsRouter.put(
	'/:id/contacted',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (req, res) => {
		const id = Number(req.params.id);
		const updated = await prismaUnscoped.enterpriseLead.update({ where: { id }, data: { contactedAt: new Date() } });
		res.json(updated);
	}),
);
