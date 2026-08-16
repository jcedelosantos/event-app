import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../lib/async-handler';
import { isPlanCode, PLANS, PlanCode } from '../lib/plans';
import { createSubscription, reviseSubscription, PayPalBillingRequestError } from '../lib/paypal-billing';
import { computeTenantOverage } from '../lib/overage';

// Self-service: el propio tenant cambia su plan sin pasar por el Super Admin — distinto de
// tenants.ts (que es exclusivamente para el panel de Super Admin sobre CUALQUIER tenant). No lleva
// requireActiveSubscription a propósito: una cuenta PAST_DUE/SUSPENDED tiene que poder usar esto
// para regularizarse, es la única puerta de salida de un estado bloqueado.
export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth, requireTenant, blockScannerRole);

const upgradeSchema = z.object({ plan: z.string() });

// Orden de tiers recurrentes de menor a mayor — usado solo para encontrar "el siguiente escalón",
// no para nada de PayPal (ver lib/plans.ts para el catálogo real).
const PLAN_ORDER: PlanCode[] = ['BASICO', 'INTERMEDIO', 'AVANZADO', 'PRO_MAX'];

// Nudge de upgrade (ver nav-bar-menu.component.ts, badge de plan) — generaliza el análisis de
// punto de equilibrio de la Fase 1 del roadmap sin hardcodear cantidades de asistentes: si el
// excedente acumulado de TODOS los eventos de este tenant (computeTenantOverage, nunca se resetea
// por período — ver comentario en lib/overage.ts) ya supera lo que costaría el siguiente escalón
// de plan, ya conviene actualizar. Un tenant en PRO_MAX (o sin plan recurrente reconocido) no tiene
// a dónde subir, así que nunca sugiere nada.
subscriptionRouter.get('/overage-nudge', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
	if (!tenant?.plan || !isPlanCode(tenant.plan)) {
		res.json({ shouldUpgrade: false });
		return;
	}
	const nextPlan = PLAN_ORDER[PLAN_ORDER.indexOf(tenant.plan) + 1];
	if (!nextPlan) {
		res.json({ shouldUpgrade: false });
		return;
	}
	const { totalCents: overageCents } = await computeTenantOverage(tenantId);
	const priceDiffCents = PLANS[nextPlan].priceCents - PLANS[tenant.plan].priceCents;
	const shouldUpgrade = overageCents > priceDiffCents;
	res.json({
		shouldUpgrade,
		suggestedPlan: shouldUpgrade ? nextPlan : null,
		suggestedPlanName: shouldUpgrade ? PLANS[nextPlan].name : null,
		overageCents,
		priceDiffCents,
	});
}));

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
			const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
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

		const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
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
