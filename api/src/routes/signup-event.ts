import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prismaUnscoped } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { checkoutRateLimiter } from '../middleware/rate-limit';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { uniqueTenantSlug } from '../lib/slug';
import { isEventPlanCode, EVENT_PLANS } from '../lib/event-plans';
import { createPlatformOrder, capturePlatformOrder, PayPalPlatformRequestError } from '../lib/paypal-platform-orders';
import { getPlatformConfig } from '../lib/paypal-billing';
import { getInvoiceIssuerConfig } from '../lib/invoice-config';
import { formatUploadError, imageUpload } from '../lib/uploads';
import { sendBankTransferReceiptNotification } from '../lib/mail';
import { getUsdToDopRate } from '../lib/exchange-rate';
import { hasValidMxRecord } from '../lib/email-validation';

// Alta pública de un tenant "evento único, sin suscripción" (Event-as-a-Service) — mismo patrón
// de transacción que signup.ts, pero SIN fila de Subscription (es un pago único, no recurrente,
// ver lib/event-plans.ts) y con un checkout de Orders v2 (create-order/capture-order, mismo shape
// que public.ts /checkout/paypal/*) en vez del flujo de Billing Subscriptions + webhook.
export const signupEventRouter = Router();

const signupEventSchema = z.object({
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
	eventPlanCode: z.string(),
	// PayPal sigue siendo el default/automático de siempre; BANK_TRANSFER es la alternativa manual
	// (ver POST /signup-event/submit-receipt más abajo) — el Super Admin confirma el pago a mano.
	paymentMethod: z.enum(['PAYPAL', 'BANK_TRANSFER']).optional().default('PAYPAL'),
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
		const { organization, admin, eventPlanCode, paymentMethod } = parsed.data;
		if (!isEventPlanCode(eventPlanCode)) {
			res.status(400).json({ error: 'Plan de evento inválido' });
			return;
		}
		// Mismo chequeo que signup.ts: el formato ya lo valida el schema, esto confirma que el
		// dominio existe antes de crear la cuenta.
		if (!(await hasValidMxRecord(admin.email))) {
			res.status(400).json({ error: 'El dominio del correo no parece existir — revisá que esté bien escrito.' });
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

		// Transferencia bancaria: el tenant queda PENDING igual que con PayPal, pero sin orden que
		// crear — el frontend pasa directo al paso de mostrar los datos de cuenta y subir el
		// comprobante (ver POST /signup-event/submit-receipt), sin tocar PayPal para nada.
		if (paymentMethod === 'BANK_TRANSFER') {
			res.status(201).json({ tenantId });
			return;
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

// Datos de cuenta para transferir — la MISMA cuenta que ya carga el Super Admin para las facturas
// (ver lib/invoice-config.ts, modal "Facturación") — se reutiliza tal cual, angosto a propósito:
// solo los 4 campos de banco, nada de lo demás que trae ese config (NCF, RNC, etc. no son públicos).
signupEventRouter.get(
	'/signup-event/bank-info',
	asyncHandler(async (_req, res) => {
		const [config, usdToDopRate] = await Promise.all([getInvoiceIssuerConfig(), getUsdToDopRate()]);
		res.json({
			bankName: config.bankName,
			bankAccountType: config.bankAccountType,
			bankAccountNumber: config.bankAccountNumber,
			bankAccountHolder: config.bankAccountHolder,
			usdToDopRate,
		});
	}),
);

// Sube la foto del comprobante — mismo wrapping por Promise que platform-settings.ts POST /logo
// (multer usa callback, no promesa) pero público + rate-limited en vez de Super-Admin-gated, ya que
// quien paga acá todavía no tiene ninguna cuenta activa.
signupEventRouter.post(
	'/signup-event/upload-receipt',
	checkoutRateLimiter,
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

const submitReceiptSchema = z.object({ tenantId: z.number().int(), receiptUrl: z.string().min(1) });

signupEventRouter.post(
	'/signup-event/submit-receipt',
	checkoutRateLimiter,
	asyncHandler(async (req, res) => {
		const parsed = submitReceiptSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { tenantId, receiptUrl } = parsed.data;

		const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
		// Solo desde PENDING — evita que alguien reenvíe un comprobante sobre un tenant ya activado o
		// ya en revisión (ej. doble click, o pegar el mismo tenantId a mano contra la API).
		if (!tenant || !isEventPlanCode(tenant.plan) || tenant.planStatus !== 'PENDING') {
			res.status(409).json({ error: 'Esta organización no está esperando un comprobante de pago.' });
			return;
		}

		await prismaUnscoped.tenant.update({ where: { id: tenantId }, data: { paymentReceiptUrl: receiptUrl, planStatus: 'PENDING_REVIEW' } });

		sendBankTransferReceiptNotification({
			tenantName: tenant.name,
			tierName: EVENT_PLANS[tenant.plan].name,
			amountUSD: EVENT_PLANS[tenant.plan].priceUSD,
			receiptUrl,
		}).catch((err) => console.error('[signup-event] No se pudo enviar el aviso de comprobante por correo:', err));

		res.json({ tenantId, planStatus: 'PENDING_REVIEW' });
	}),
);

// Cola de comprobantes a revisar — mismo patrón que GET /service-requests/admin.
signupEventRouter.get(
	'/signup-event/admin',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (_req, res) => {
		const tenants = await prismaUnscoped.tenant.findMany({
			where: { planStatus: 'PENDING_REVIEW' },
			select: { id: true, name: true, slug: true, plan: true, paymentReceiptUrl: true, createdAt: true },
			orderBy: { createdAt: 'desc' },
		});
		res.json(tenants);
	}),
);

const reviewSchema = z.object({ approve: z.boolean() });

signupEventRouter.put(
	'/signup-event/:tenantId/review',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (req, res) => {
		const tenantId = Number(req.params.tenantId);
		const parsed = reviewSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}

		const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
		if (!tenant || tenant.planStatus !== 'PENDING_REVIEW') {
			res.status(409).json({ error: 'Esta organización no tiene un comprobante pendiente de revisión.' });
			return;
		}

		// approve: true → mismo efecto que una captura de PayPal exitosa. approve: false → CANCELLED,
		// mismo estado terminal ya usado para cancelaciones (sin valor nuevo para "rechazado").
		const updated = await prismaUnscoped.tenant.update({
			where: { id: tenantId },
			data: { planStatus: parsed.data.approve ? 'ACTIVE' : 'CANCELLED' },
		});
		res.json({ tenantId: updated.id, planStatus: updated.planStatus });
	}),
);
