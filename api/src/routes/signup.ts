import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { uniqueTenantSlug } from '../lib/slug';
import { isPlanCode, PLANS } from '../lib/plans';
import { createSubscription, getSubscription, verifyPlatformWebhookSignature, planCodeForBillingPlanId, PayPalBillingRequestError } from '../lib/paypal-billing';
import { generateAndStoreInvoice } from '../lib/invoice-generation';
import { sendNewTenantNotification, sendBankTransferReceiptNotification } from '../lib/mail';
import { hasValidMxRecord } from '../lib/email-validation';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';

// Auto-login de un solo uso tras el alta (ver Subscription.claimTokenHash) — 30 minutos alcanza de
// sobra para el checkout de PayPal más lento, y limita la ventana de un token que quedó sin usar
// (ej. el comprador cerró la pestaña) dando vueltas en el historial del navegador.
const CLAIM_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashClaimToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

// Alta pública de una organización nueva — versión sin Super Admin de tenants.ts:post('/'), más la
// suscripción recurrente (PayPal Billing) que ahí no existe porque un Super Admin activa el plan a
// mano. Separado de public.ts (ya es un archivo enorme) porque esto es sobre la organización en sí,
// no sobre la venta de tickets de un tenant ya existente.
export const signupRouter = Router();

const signupSchema = z.object({
	organization: z.object({
		name: z.string().min(1),
		type: z.enum(['GENERAL', 'CLUB', 'CHURCH', 'ONG', 'PRIVADA', 'PUBLICA', 'INDEPENDIENTE']).optional().default('GENERAL'),
	}),
	admin: z.object({
		username: z.string().min(3),
		password: z.string().min(4),
		name: z.string().min(1),
		lastname: z.string().min(1),
		email: z.string().email(),
	}),
	plan: z.string(),
	// PayPal sigue siendo el default/automático; BANK_TRANSFER es la alternativa manual (ver POST
	// /signup/submit-receipt más abajo) — mismo criterio que signup-event.ts, pero acá la
	// suscripción no tiene forma de cobrarse sola mes a mes: el cliente transfiere cada ciclo y un
	// Super Admin confirma a mano (ver comentario en POST /signup/submit-receipt).
	paymentMethod: z.enum(['PAYPAL', 'BANK_TRANSFER']).optional().default('PAYPAL'),
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
		const { organization, admin, plan, paymentMethod } = parsed.data;
		if (!isPlanCode(plan)) {
			res.status(400).json({ error: 'Plan inválido' });
			return;
		}
		// z.string().email() de arriba solo valida el FORMATO — esto además confirma que el dominio
		// existe (detecta typos como "gmial.com" antes de crear la cuenta con un correo al que nunca
		// va a poder llegar el welcome/las facturas).
		if (!(await hasValidMxRecord(admin.email))) {
			res.status(400).json({ error: 'El dominio del correo no parece existir — revisa que esté bien escrito.' });
			return;
		}
		// Pro Enterprise ya no es autoservicio: se cotiza y lo activa un Super Admin a mano (ver
		// comentario en lib/plans.ts) — bloqueado acá además de en el frontend por si alguien pega el
		// código de plan directo contra la API.
		if (plan === 'PRO_MAX') {
			res.status(400).json({ error: 'El plan Pro Enterprise se cotiza y activa a medida — contactá a nuestro equipo.' });
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

		// Transferencia bancaria: el tenant/Subscription quedan PENDING igual que con PayPal, pero sin
		// nada que crear del lado de PayPal — el frontend pasa directo al paso de mostrar los datos de
		// cuenta y subir el comprobante (ver POST /signup/submit-receipt), sin paypalSubscriptionId.
		if (paymentMethod === 'BANK_TRANSFER') {
			res.status(201).json({ tenantId });
			return;
		}

		// Claim token de un solo uso para el auto-login (ver GET /signup/status/:tenantId más abajo) —
		// viaja embebido en el return_url de PayPal, así sobrevive la ida y vuelta por un sitio externo
		// sin depender de localStorage/sessionStorage (PayPal navega en la MISMA pestaña).
		const claimToken = randomBytes(32).toString('hex');
		await prismaUnscoped.subscription.update({
			where: { tenantId },
			data: { claimTokenHash: hashClaimToken(claimToken), claimTokenExpiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS) },
		});

		// Se crea el tenant/admin/Subscription ANTES de llamar a PayPal a propósito: la suscripción
		// de PayPal necesita el tenantId como custom_id para que el webhook pueda resolverlo después.
		// Si esta llamada falla, el tenant queda en planStatus PENDING (huérfano, sin acceso) — se
		// puede reintentar el alta más adelante o limpiarlo a mano desde Super Admin; no se revierte
		// la transacción anterior porque no hay forma de "deshacer" sin conocer aún el tenantId.
		const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
		try {
			const { paypalSubscriptionId, approveUrl } = await createSubscription(
				plan,
				tenantId,
				`${frontendUrl}/signup/confirmacion?tenant=${tenantId}&claim=${claimToken}`,
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
// waiting-room/live-stats. Solo expone plan/status, nada sensible — SALVO que venga el claim
// token correcto (ver POST /signup), en cuyo caso además emite una sesión real y lo invalida.
signupRouter.get(
	'/signup/status/:tenantId',
	asyncHandler(async (req, res) => {
		const tenantId = Number(req.params.tenantId);
		const subscription = await prismaUnscoped.subscription.findUnique({ where: { tenantId } });
		if (!subscription) {
			res.status(404).json({ error: 'No encontrado' });
			return;
		}

		const claim = typeof req.query.claim === 'string' ? req.query.claim : null;
		// Sin claim, con status distinto de ACTIVE, ya consumido (hash null), o vencido: respuesta
		// normal sin sesión — el frontend cae al link manual "Iniciar sesión", nunca se bloquea.
		if (claim && subscription.status === 'ACTIVE' && subscription.claimTokenHash && subscription.claimTokenExpiresAt && subscription.claimTokenExpiresAt > new Date() && hashClaimToken(claim) === subscription.claimTokenHash) {
			// Invalidar ANTES de responder: si dos requests llegan casi juntos (el usuario con dos
			// pestañas, o un reintento de red), sólo el primer update en tocar la fila con el hash
			// todavía puesto gana — el resto ya no encuentra match y cae al camino sin sesión.
			const consumed = await prismaUnscoped.subscription.updateMany({
				where: { tenantId, claimTokenHash: subscription.claimTokenHash },
				data: { claimTokenHash: null, claimTokenExpiresAt: null },
			});
			if (consumed.count > 0) {
				res.json({ plan: subscription.plan, status: subscription.status, ...(await signAdminSession(tenantId)) });
				return;
			}
		}

		res.json({ plan: subscription.plan, status: subscription.status });
	}),
);

// Confirma el comprobante de transferencia de una suscripción recurrente elegida con
// paymentMethod BANK_TRANSFER (ver POST /signup) — a diferencia del evento único
// (signup-event.ts), acá no hay forma de cobrar automáticamente los ciclos siguientes (PayPal
// Subscriptions requiere una suscripción real, y esta cuenta eligió no usar PayPal para nada): el
// Super Admin confirma el primer pago acá, y los renovaciones futuras se gestionan aparte, fuera
// de este flujo. GET /signup-event/bank-info y POST /signup-event/upload-receipt se reusan tal
// cual (no tienen nada específico de evento único) — solo este paso final difiere porque valida
// contra un plan recurrente (isPlanCode) y actualiza también la fila de Subscription.
const submitReceiptSchema = z.object({ tenantId: z.number().int(), receiptUrl: z.string().min(1) });

signupRouter.post(
	'/signup/submit-receipt',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = submitReceiptSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { tenantId, receiptUrl } = parsed.data;

		const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
		const plan = tenant?.plan ?? '';
		if (!tenant || !isPlanCode(plan) || tenant.planStatus !== 'PENDING') {
			res.status(409).json({ error: 'Esta organización no está esperando un comprobante de pago.' });
			return;
		}

		await prismaUnscoped.$transaction([
			prismaUnscoped.tenant.update({ where: { id: tenantId }, data: { paymentReceiptUrl: receiptUrl, planStatus: 'PENDING_REVIEW' } }),
			prismaUnscoped.subscription.update({ where: { tenantId }, data: { status: 'PENDING_REVIEW' } }),
		]);

		sendBankTransferReceiptNotification({
			tenantName: tenant.name,
			tierName: PLANS[plan].name,
			amountCents: PLANS[plan].priceCents,
			receiptUrl,
		}).catch((err) => console.error('[signup] No se pudo enviar el aviso de comprobante por correo:', err));

		res.json({ tenantId, planStatus: 'PENDING_REVIEW' });
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
		// "subscription.status" es el estado ANTES de esta actualización — PENDING es exclusivo del
		// alta recién creada (ver POST /signup más arriba), nunca vuelve a valer eso después. Cualquier
		// reactivación posterior (tras SUSPENDED/PAST_DUE/CANCELLED) entra con otro status, así que
		// esta condición dispara la factura de bienvenida UNA sola vez por tenant, no en cada renovación.
		const isFirstActivation = subscription.status === 'PENDING' && nextStatus === 'ACTIVE';
		if (nextStatus) {
			await prismaUnscoped.$transaction([
				prismaUnscoped.subscription.update({ where: { tenantId: subscription.tenantId }, data: { status: nextStatus } }),
				prismaUnscoped.tenant.update({ where: { id: subscription.tenantId }, data: { planStatus: nextStatus } }),
			]);
		}

		if (isFirstActivation) {
			generateWelcomeInvoiceOnce(subscription.tenantId).catch((err) => console.error('No se pudo generar la factura de bienvenida:', err));
			notifyNewTenant(subscription.tenantId).catch((err) => console.error('No se pudo avisar el alta del tenant:', err));
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

		// A diferencia de los demás eventos (que solo tocan status), un upgrade/downgrade self-service
		// (ver routes/subscription.ts POST /upgrade) cambia el PLAN de la suscripción — este evento es
		// la única confirmación server-to-server de que PayPal realmente aplicó el cambio. El plan_id
		// que trae el webhook es de PayPal, no nuestro PlanCode: hay que mapearlo contra los 4 env vars
		// conocidos (ver planCodeForBillingPlanId).
		if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
			try {
				const info = await getSubscription(paypalSubscriptionId);
				const newPlan = info.planId ? planCodeForBillingPlanId(info.planId) : null;
				if (newPlan) {
					await prismaUnscoped.$transaction([
						prismaUnscoped.subscription.update({ where: { tenantId: subscription.tenantId }, data: { plan: newPlan } }),
						prismaUnscoped.tenant.update({ where: { id: subscription.tenantId }, data: { plan: newPlan } }),
					]);
				} else {
					console.error(`BILLING.SUBSCRIPTION.UPDATED: plan_id "${info.planId}" no coincide con ningún PAYPAL_PLAN_ID_* conocido.`);
				}
			} catch (err) {
				console.error('No se pudo aplicar el cambio de plan tras el webhook:', err);
			}
		}

		res.json({ received: true });
	}),
);

// A prueba de reenvíos del webhook de PayPal (puede reentregar el mismo evento más de una vez) —
// además de la guarda por status en el caller, esto chequea que el tenant todavía no tenga NINGUNA
// factura antes de generar la de bienvenida, así una entrega duplicada no crea dos. Exportada:
// también la usa signup-event.ts al aprobar un comprobante de transferencia de una suscripción
// recurrente (ver PUT /signup-event/:tenantId/review), que es la otra ruta real de "primera
// activación" además del webhook de PayPal.
export async function generateWelcomeInvoiceOnce(tenantId: number): Promise<void> {
	const existing = await prisma.invoice.count({ where: { tenantId } });
	if (existing > 0) return;
	await generateAndStoreInvoice(tenantId, 'WELCOME');
}

// Avisa al Super Admin (SUPER_ADMIN_NOTIFICATION_EMAIL) de un cliente que acaba de activar su
// suscripción — mismo trigger que generateWelcomeInvoiceOnce (y exportada por el mismo motivo), así
// que solo llega para altas que de verdad confirmaron el pago, no para quien completó el formulario
// y nunca activó.
export async function notifyNewTenant(tenantId: number): Promise<void> {
	const tenant = await prismaUnscoped.tenant.findUnique({
		where: { id: tenantId },
		include: { users: { where: { type: { type: 'ROOT' } }, take: 1 } },
	});
	if (!tenant) return;
	const admin = tenant.users[0];
	await sendNewTenantNotification({
		tenantName: tenant.name,
		plan: tenant.plan ?? '—',
		adminEmail: admin?.email ?? '—',
		adminUsername: admin?.username ?? '—',
	});
}

// Emite una sesión real para el admin ROOT de un tenant recién activado — usado por el auto-login
// de ambos flujos de alta (acá vía claim token, y por signup-event.ts directo en su capture
// síncrono). Devuelve un objeto vacío si por algún motivo no hay admin ROOT todavía, así el caller
// puede spread-earlo directo en la respuesta sin romper el shape cuando no hay sesión que dar.
export async function signAdminSession(tenantId: number): Promise<{ token: string; user: ReturnType<typeof toPublicUser> } | Record<string, never>> {
	const admin = await prismaUnscoped.user.findFirst({
		where: { tenantId, type: { type: 'ROOT' } },
		include: { type: true, tenant: { select: { id: true, name: true, type: true, slug: true, logoUrl: true, plan: true, planStatus: true } } },
	});
	if (!admin) return {};
	const token = signToken({ userId: admin.id, username: admin.username, userType: admin.type.type, tenantId: admin.tenantId });
	return { token, user: toPublicUser(admin) };
}
