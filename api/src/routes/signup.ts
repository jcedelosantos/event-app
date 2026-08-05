import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prismaUnscoped } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { uniqueTenantSlug } from '../lib/slug';
import { isPlanCode } from '../lib/plans';
import { createSubscription, getSubscription, verifyPlatformWebhookSignature, PayPalBillingRequestError } from '../lib/paypal-billing';

// Alta pública de una organización nueva — versión sin Super Admin de tenants.ts:post('/'), más la
// suscripción recurrente (PayPal Billing) que ahí no existe porque un Super Admin activa el plan a
// mano. Separado de public.ts (ya es un archivo enorme) porque esto es sobre la organización en sí,
// no sobre la venta de tickets de un tenant ya existente.
export const signupRouter = Router();

const signupSchema = z.object({
	organization: z.object({
		name: z.string().min(1),
		type: z.enum(['GENERAL', 'CLUB', 'CHURCH']).optional().default('GENERAL'),
	}),
	admin: z.object({
		username: z.string().min(3),
		password: z.string().min(4),
		name: z.string().min(1),
		lastname: z.string().min(1),
		email: z.string().email(),
	}),
	plan: z.string(),
});

signupRouter.post(
	'/signup',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = signupSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { organization, admin, plan } = parsed.data;
		if (!isPlanCode(plan)) {
			res.status(400).json({ error: 'Plan inválido' });
			return;
		}

		const adminType = await prismaUnscoped.userType.findFirst({ where: { type: 'ROOT' } });
		if (!adminType) {
			res.status(500).json({ error: 'No existe el tipo de usuario ROOT' });
			return;
		}

		const slug = await uniqueTenantSlug(organization.name);

		let tenantId: number;
		try {
			const hashed = await bcrypt.hash(admin.password, 10);
			const tenant = await prismaUnscoped.$transaction(async (tx) => {
				// planStatus PENDING desde el arranque: el feature-gating (ver middleware/plan.ts)
				// trata cualquier estado que no sea ACTIVE como sin acceso — este tenant no puede
				// operar hasta que el webhook de PayPal confirme el primer cobro.
				const newTenant = await tx.tenant.create({ data: { name: organization.name, slug, type: organization.type, plan, planStatus: 'PENDING' } });
				await tx.user.create({
					data: {
						username: admin.username,
						password: hashed,
						name: admin.name,
						lastname: admin.lastname,
						email: admin.email,
						gender: '',
						adress: '',
						carnet: '',
						phone: '',
						typeId: adminType.id,
						tenantId: newTenant.id,
					},
				});
				await tx.subscription.create({ data: { tenantId: newTenant.id, plan, status: 'PENDING' } });
				return newTenant;
			});
			tenantId = tenant.id;
		} catch (err: any) {
			if (err.code === 'P2002') {
				res.status(409).json({ error: 'El usuario o el email ya están en uso' });
				return;
			}
			throw err;
		}

		// Se crea el tenant/admin/Subscription ANTES de llamar a PayPal a propósito: la suscripción
		// de PayPal necesita el tenantId como custom_id para que el webhook pueda resolverlo después.
		// Si esta llamada falla, el tenant queda en planStatus PENDING (huérfano, sin acceso) — se
		// puede reintentar el alta más adelante o limpiarlo a mano desde Super Admin; no se revierte
		// la transacción anterior porque no hay forma de "deshacer" sin conocer aún el tenantId.
		const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4201';
		try {
			const { paypalSubscriptionId, approveUrl } = await createSubscription(
				plan,
				tenantId,
				`${frontendUrl}/signup/confirmacion?tenant=${tenantId}`,
				`${frontendUrl}/signup`,
			);
			await prismaUnscoped.subscription.update({ where: { tenantId }, data: { paypalSubscriptionId } });
			res.status(201).json({ tenantId, paypalSubscriptionId, approveUrl });
		} catch (err) {
			console.error('Error creando la suscripción de PayPal:', err);
			const message = err instanceof PayPalBillingRequestError ? err.message : 'No se pudo iniciar el cobro de la suscripción.';
			res.status(502).json({ error: `Tu organización se creó, pero ${message.toLowerCase()} Contactanos para activar tu plan.`, tenantId });
		}
	}),
);

// Pantalla de confirmación pública (sin token: el admin recién creado todavía no inició sesión)
// pollea acá mientras espera que el webhook confirme el pago — mismo espíritu que el polling de
// waiting-room/live-stats. Solo expone plan/status, nada sensible.
signupRouter.get(
	'/signup/status/:tenantId',
	asyncHandler(async (req, res) => {
		const tenantId = Number(req.params.tenantId);
		const subscription = await prismaUnscoped.subscription.findUnique({ where: { tenantId } });
		if (!subscription) {
			res.status(404).json({ error: 'No encontrado' });
			return;
		}
		res.json({ plan: subscription.plan, status: subscription.status });
	}),
);

function mapEventTypeToStatus(eventType: string | undefined): string | null {
	switch (eventType) {
		case 'BILLING.SUBSCRIPTION.ACTIVATED':
		case 'PAYMENT.SALE.COMPLETED':
			return 'ACTIVE';
		case 'PAYMENT.SALE.DENIED':
			return 'PAST_DUE';
		case 'BILLING.SUBSCRIPTION.SUSPENDED':
			return 'SUSPENDED';
		case 'BILLING.SUBSCRIPTION.CANCELLED':
		case 'BILLING.SUBSCRIPTION.EXPIRED':
			return 'CANCELLED';
		default:
			return null;
	}
}

// Fuente de verdad real del estado de la suscripción — el frontend nunca marca ACTIVE por su
// cuenta, solo pollea /signup/status hasta que este webhook haya corrido (mismo criterio que el
// webhook de tickets en public.ts: confirmación server-to-server, no confiar en el cliente).
signupRouter.post(
	'/webhooks/paypal-billing',
	asyncHandler(async (req, res) => {
		const eventType = req.body?.event_type as string | undefined;
		const resource = req.body?.resource;
		// BILLING.SUBSCRIPTION.* trae la suscripción como resource (resource.id = subscription id);
		// PAYMENT.SALE.* trae el cobro puntual, con billing_agreement_id apuntando a la suscripción.
		const paypalSubscriptionId: string | undefined = resource?.id ?? resource?.billing_agreement_id;
		if (!paypalSubscriptionId) {
			res.json({ received: true });
			return;
		}

		const subscription = await prismaUnscoped.subscription.findUnique({ where: { paypalSubscriptionId } });
		if (!subscription) {
			res.json({ received: true });
			return;
		}

		const verified = await verifyPlatformWebhookSignature(req.headers as Record<string, string | string[] | undefined>, req.body);
		if (!verified) {
			res.status(400).json({ error: 'Firma de webhook inválida' });
			return;
		}

		const nextStatus = mapEventTypeToStatus(eventType);
		if (nextStatus) {
			await prismaUnscoped.$transaction([
				prismaUnscoped.subscription.update({ where: { tenantId: subscription.tenantId }, data: { status: nextStatus } }),
				prismaUnscoped.tenant.update({ where: { id: subscription.tenantId }, data: { planStatus: nextStatus } }),
			]);
		}

		if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED' || eventType === 'PAYMENT.SALE.COMPLETED') {
			try {
				const info = await getSubscription(paypalSubscriptionId);
				await prismaUnscoped.subscription.update({
					where: { tenantId: subscription.tenantId },
					data: { currentPeriodEnd: info.nextBillingTime ? new Date(info.nextBillingTime) : null },
				});
			} catch (err) {
				console.error('No se pudo refrescar currentPeriodEnd tras el webhook:', err);
			}
		}

		res.json({ received: true });
	}),
);
