import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prismaUnscoped } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { uniqueTenantSlug } from '../lib/slug';
import { isEventPlanCode, EVENT_PLANS } from '../lib/event-plans';
import { createPlatformOrder, capturePlatformOrder, PayPalPlatformRequestError } from '../lib/paypal-platform-orders';
import { getPlatformConfig } from '../lib/paypal-billing';

// Alta pública de un tenant "evento único, sin suscripción" (Event-as-a-Service) — mismo patrón
// de transacción que signup.ts, pero SIN fila de Subscription (es un pago único, no recurrente,
// ver lib/event-plans.ts) y con un checkout de Orders v2 (create-order/capture-order, mismo shape
// que public.ts /checkout/paypal/*) en vez del flujo de Billing Subscriptions + webhook.
export const signupEventRouter = Router();

const signupEventSchema = z.object({
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
	eventPlanCode: z.string(),
});

// El Client ID de PayPal no es un secreto (a diferencia del Secret, que nunca sale de acá) — lo
// necesita el frontend público para cargar el SDK de Smart Buttons antes de que exista ningún
// tenant (ver ensurePaypalButtons en public-event.component.ts, mismo mecanismo de carga).
signupEventRouter.get(
	'/signup-event/paypal-client-id',
	asyncHandler(async (_req, res) => {
		try {
			const config = await getPlatformConfig();
			res.json({ clientId: config.clientId });
		} catch {
			res.status(502).json({ error: 'El pago de eventos únicos todavía no está disponible.' });
		}
	}),
);

signupEventRouter.post(
	'/signup-event',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = signupEventSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { organization, admin, eventPlanCode } = parsed.data;
		if (!isEventPlanCode(eventPlanCode)) {
			res.status(400).json({ error: 'Plan de evento inválido' });
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
			// planStatus PENDING hasta que /signup-event/capture confirme el pago — mismo criterio que
			// signup.ts, pero acá no hay fila de Subscription: es un pago único, no una suscripción.
			const tenant = await prismaUnscoped.$transaction(async (tx) => {
				const newTenant = await tx.tenant.create({
					data: { name: organization.name, slug, type: organization.type, plan: eventPlanCode, planStatus: 'PENDING' },
				});
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

		// Se crea el tenant/admin ANTES de llamar a PayPal a propósito, igual que signup.ts — si esta
		// llamada falla el tenant queda PENDING (sin acceso), reintentable desde el frontend con el
		// mismo tenantId ya devuelto.
		try {
			const { orderId } = await createPlatformOrder(EVENT_PLANS[eventPlanCode].priceUSD, slug);
			res.status(201).json({ tenantId, orderId });
		} catch (err) {
			console.error('Error creando la orden de PayPal para el evento único:', err);
			const message = err instanceof PayPalPlatformRequestError ? err.message : 'No se pudo iniciar el cobro.';
			res.status(502).json({ error: `Tu organización se creó, pero ${message.toLowerCase()} Contactanos para completar el pago.`, tenantId });
		}
	}),
);

const captureSchema = z.object({ tenantId: z.number().int(), orderId: z.string().min(1) });

signupEventRouter.post(
	'/signup-event/capture',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = captureSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { tenantId, orderId } = parsed.data;

		const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
		if (!tenant || !isEventPlanCode(tenant.plan)) {
			res.status(404).json({ error: 'No encontramos esa organización' });
			return;
		}

		// Idempotente: si ya se activó (ej. el cliente reintentó tras un timeout de red), no vuelve a
		// llamar a PayPal — mismo espíritu que el manejo de ORDER_ALREADY_CAPTURED más abajo.
		if (tenant.planStatus === 'ACTIVE') {
			res.json({ tenantId, planStatus: 'ACTIVE' });
			return;
		}

		try {
			const capture = await capturePlatformOrder(orderId);
			if (capture.status !== 'COMPLETED') {
				res.status(409).json({ error: 'PayPal todavía no confirmó el pago — esperá un momento y volvé a intentar.' });
				return;
			}
			await prismaUnscoped.tenant.update({ where: { id: tenantId }, data: { planStatus: 'ACTIVE' } });
			res.json({ tenantId, planStatus: 'ACTIVE' });
		} catch (err) {
			if (err instanceof PayPalPlatformRequestError) {
				res.status(502).json({ error: err.message });
				return;
			}
			throw err;
		}
	}),
);
