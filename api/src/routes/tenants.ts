import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { requireAuth, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';
import { logAudit } from '../lib/audit';
import { asyncHandler } from '../lib/async-handler';
import { uniqueTenantSlug } from '../lib/slug';
import { computeTenantOverage } from '../lib/overage';
import { EVENT_PLAN_CODES } from '../lib/event-plans';
import { cancelSubscription } from '../lib/paypal-billing';
import { generateAndStoreInvoice } from '../lib/invoice-generation';
import { hasValidMxRecord } from '../lib/email-validation';

// Panel de Super Admin: alta de nuevos clientes (clubes/iglesias) y su primer usuario admin. Usa
// prismaUnscoped a propósito — el tenant-guard exige tenantId en cada query de los modelos de
// negocio, pero acá el objetivo es justamente CREAR tenants nuevos y consultarlos a todos, así que
// no aplica.
export const tenantsRouter = Router();
tenantsRouter.use(requireAuth, requireSuperAdmin);

tenantsRouter.get('/', asyncHandler(async (_req, res) => {
	const tenants = await prismaUnscoped.tenant.findMany({
		orderBy: { id: 'asc' },
		include: { _count: { select: { users: true, events: true } } },
	});
	res.json(tenants);
}));

const tenantTypeSchema = z.enum(['GENERAL', 'CLUB', 'CHURCH', 'ONG', 'PRIVADA', 'PUBLICA', 'INDEPENDIENTE']);

const createTenantSchema = z.object({
	name: z.string().min(1),
	type: tenantTypeSchema.optional().default('GENERAL'),
	admin: z.object({
		username: z.string().min(1),
		password: z.string().min(4),
		name: z.string().min(1),
		lastname: z.string().min(1),
		email: z.string().email(),
	}),
});

tenantsRouter.post('/', asyncHandler(async (req, res) => {
	const parsed = createTenantSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}
	const { name, type, admin } = parsed.data;
	// Mismo chequeo que las altas públicas (signup.ts/signup-event.ts): el formato ya lo valida el
	// schema, esto confirma que el dominio existe antes de crear la cuenta.
	if (!(await hasValidMxRecord(admin.email))) {
		res.status(400).json({ error: 'El dominio del correo no parece existir — revisa que esté bien escrito.' });
		return;
	}

	const adminType = await prismaUnscoped.userType.findFirst({ where: { type: 'ROOT' } });
	if (!adminType) {
		res.status(500).json({ error: 'No existe el tipo de usuario ROOT' });
		return;
	}

	const slug = await uniqueTenantSlug(name);

	try {
		const hashed = await bcrypt.hash(admin.password, 10);
		const tenant = await prismaUnscoped.$transaction(async (tx) => {
			const newTenant = await tx.tenant.create({ data: { name, slug, type } });
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
		res.status(201).json(tenant);
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'El username o email del admin ya está en uso' });
			return;
		}
		throw err;
	}
}));

const updateTenantSchema = z.object({
	name: z.string().min(1).optional(),
	active: z.boolean().optional(),
	type: tenantTypeSchema.optional(),
	// Datos fiscales/de contacto para el bloque "Para" de la factura (ver lib/invoice-pdf.ts) —
	// string vacío se guarda tal cual y el PDF simplemente omite la línea, no hace falta null.
	rnc: z.string().max(50).optional(),
	address: z.string().max(300).optional(),
	phone: z.string().max(50).optional(),
});

tenantsRouter.put('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = updateTenantSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	try {
		const tenant = await prismaUnscoped.tenant.update({ where: { id }, data: parsed.data });
		res.json(tenant);
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Organización no encontrada' });
			return;
		}
		throw err;
	}
}));

// Reactivación manual de un tenant de evento único archivado (ver lib/event-plan-expiry.ts) —
// vuelve a ACTIVE a mano, sin automatizar nada (el cron lo va a volver a archivar si el Super Admin
// no le da un nuevo evento). Restringido a evento único + ARCHIVED a propósito: un tenant recurrente
// PAST_DUE/SUSPENDED se regulariza por PayPal (ver subscription.ts), no por acá.
tenantsRouter.post('/:id/reactivate', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { id } });
	if (!tenant) {
		res.status(404).json({ error: 'Organización no encontrada' });
		return;
	}
	if (!tenant.plan || !EVENT_PLAN_CODES.includes(tenant.plan as any) || tenant.planStatus !== 'ARCHIVED') {
		res.status(400).json({ error: 'Solo se puede reactivar así un tenant de evento único archivado.' });
		return;
	}
	const updated = await prismaUnscoped.tenant.update({ where: { id }, data: { planStatus: 'ACTIVE' } });
	await logAudit({
		tenantId: id,
		userId: req.user!.userId,
		action: 'UPDATE',
		entity: 'Tenant',
		entityId: id,
		summary: 'El Super Admin reactivó manualmente esta organización archivada',
	});
	res.json(updated);
}));

// "Entrar como" una organización: emite un token válido para su primer admin (ROOT), sin pedir su
// contraseña — el Super Admin ya demostró su identidad para llegar hasta acá. Se audita en el log
// de ESA organización para que quede transparencia de cuándo y quién entró en su nombre.
tenantsRouter.post('/:id/impersonate', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { id } });
	if (!tenant) {
		res.status(404).json({ error: 'Organización no encontrada' });
		return;
	}

	const adminUser = await prismaUnscoped.user.findFirst({
		where: { tenantId: id, type: { type: 'ROOT' } },
		include: { type: true, tenant: { select: { id: true, name: true, type: true, slug: true, logoUrl: true, plan: true, planStatus: true } } },
		orderBy: { id: 'asc' },
	});
	if (!adminUser) {
		res.status(404).json({ error: 'Esta organización no tiene un usuario admin configurado' });
		return;
	}

	const token = signToken({ userId: adminUser.id, username: adminUser.username, userType: adminUser.type.type, tenantId: adminUser.tenantId });

	await logAudit({
		tenantId: id,
		userId: req.user!.userId,
		action: 'IMPERSONATE',
		entity: 'Tenant',
		entityId: id,
		summary: `El Super Admin entró como "${adminUser.username}" para administrar esta organización`,
	});

	res.json({ token, user: toPublicUser(adminUser) });
}));

// Estado de la suscripción (plan/status/próxima renovación) + overage calculado del mes en curso
// para este tenant — panel de solo lectura del Super Admin (ver signup.ts para cómo se activa).
tenantsRouter.get('/:id/subscription', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const subscription = await prismaUnscoped.subscription.findUnique({ where: { tenantId: id } });
	const overage = await computeTenantOverage(id);
	res.json({ subscription, overage });
}));

// Factura modelo (plan + overage del mes) para que la agencia le facture al club aparte — ver
// lib/invoice-generation.ts y el comentario en lib/overage.ts sobre por qué esto no se cobra
// automático. Cada descarga QUEDA REGISTRADA (ver modelo Invoice) — antes se armaba en memoria y
// se descartaba, sin dejar historial; ver también GET /:id/invoices para consultarlo.
tenantsRouter.get('/:id/invoice', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { id } });
	if (!tenant) {
		res.status(404).json({ error: 'Organización no encontrada' });
		return;
	}

	const { invoice, pdf } = await generateAndStoreInvoice(id, 'MANUAL');
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', `attachment; filename="${invoice.ncf ?? invoice.invoiceNumber}.pdf"`);
	res.send(pdf);
}));

// Historial de facturas ya generadas para este tenant — de solo lectura, no dispara una emisión
// nueva (eso es GET /:id/invoice de arriba).
tenantsRouter.get('/:id/invoices', asyncHandler(async (req, res) => {
	const tenantId = Number(req.params.id);
	const invoices = await prisma.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
	res.json(invoices);
}));

// Historial de TODAS las facturas de TODOS los tenants — de solo lectura, para la sección
// "Facturas emitidas" del panel de Super Admin (ver GET /:id/invoices arriba, que es lo mismo
// pero acotado a un tenant). Sin filtrar status: incluye FAILED a propósito, es señal de que algo
// salió mal al emitir (ver lib/invoice-generation.ts).
tenantsRouter.get('/invoices', asyncHandler(async (_req, res) => {
	const invoices = await prisma.invoice.findMany({
		include: { tenant: { select: { id: true, name: true } } },
		orderBy: { createdAt: 'desc' },
	});
	res.json(invoices);
}));

const cancelSubscriptionSchema = z.object({ reason: z.string().min(1).optional().default('Cancelado por la agencia') });

// Cancela contra PayPal — el status local se actualiza recién cuando llegue el webhook
// BILLING.SUBSCRIPTION.CANCELLED (misma fuente de verdad que la activación), no acá.
tenantsRouter.post('/:id/subscription/cancel', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = cancelSubscriptionSchema.safeParse(req.body ?? {});
	const subscription = await prismaUnscoped.subscription.findUnique({ where: { tenantId: id } });
	if (!subscription?.paypalSubscriptionId) {
		res.status(404).json({ error: 'Este tenant no tiene una suscripción de PayPal activa' });
		return;
	}
	await cancelSubscription(subscription.paypalSubscriptionId, parsed.success ? parsed.data.reason : 'Cancelado por la agencia');
	res.json({ ok: true });
}));
