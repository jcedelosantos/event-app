import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { isPlanCode } from '../lib/plans';
import { createSubscription, reviseSubscription, PayPalBillingRequestError } from '../lib/paypal-billing';

// Self-service: el propio tenant cambia su plan sin pasar por el Super Admin — distinto de
// tenants.ts (que es exclusivamente para el panel de Super Admin sobre CUALQUIER tenant). No lleva
// requireActiveSubscription a propósito: una cuenta PAST_DUE/SUSPENDED tiene que poder usar esto
// para regularizarse, es la única puerta de salida de un estado bloqueado.
export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth, requireTenant);

const upgradeSchema = z.object({ plan: z.string() });

subscriptionRouter.post(
	'/upgrade',
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const parsed = upgradeSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Plan inválido' });
			return;
		}
		if (!isPlanCode(parsed.data.plan)) {
			res.status(400).json({ error: 'Plan inválido' });
			return;
		}
		const tenantId = req.user!.tenantId!;

		const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
		if (!subscription?.paypalSubscriptionId) {
			// Sin suscripción de PayPal previa — caso normal de un tenant de evento único (ver
			// lib/event-plans.ts) que quiere pasarse a un plan recurrente, o de cualquier tenant sin
			// Subscription todavía. Se crea una por primera vez, mismo flujo que signup.ts pero
			// disparado desde el panel en vez del alta pública.
			const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4201';
			try {
				const { paypalSubscriptionId, approveUrl } = await createSubscription(
					parsed.data.plan,
					tenantId,
					`${frontendUrl}/manager/suscripcion?upgraded=1`,
					`${frontendUrl}/manager/suscripcion`,
				);
				await prisma.$transaction([
					prisma.tenant.update({ where: { id: tenantId }, data: { plan: parsed.data.plan, planStatus: 'PENDING' } }),
					prisma.subscription.upsert({
						where: { tenantId },
						update: { plan: parsed.data.plan, status: 'PENDING', paypalSubscriptionId },
						create: { tenantId, plan: parsed.data.plan, status: 'PENDING', paypalSubscriptionId },
					}),
				]);
				res.json({ approveUrl });
			} catch (err) {
				const message = err instanceof PayPalBillingRequestError ? err.message : 'No se pudo iniciar la suscripción.';
				res.status(502).json({ error: message });
			}
			return;
		}
		if (subscription.plan === parsed.data.plan) {
			res.status(400).json({ error: 'Ya estás en ese plan.' });
			return;
		}

		const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4201';
		try {
			const { approveUrl } = await reviseSubscription(
				subscription.paypalSubscriptionId,
				parsed.data.plan,
				`${frontendUrl}/manager/suscripcion?upgraded=1`,
				`${frontendUrl}/manager/suscripcion`,
			);
			res.json({ approveUrl });
		} catch (err) {
			const message = err instanceof PayPalBillingRequestError ? err.message : 'No se pudo actualizar el plan.';
			res.status(502).json({ error: message });
		}
	}),
);
