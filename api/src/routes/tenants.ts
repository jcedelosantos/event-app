import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prismaUnscoped } from '../lib/prisma';
import { requireAuth, requireSuperAdmin, AuthenticatedRequest } from '../middleware/auth';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';
import { logAudit } from '../lib/audit';
import { asyncHandler } from '../lib/async-handler';

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

const slugify = (name: string) =>
	name
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

const tenantTypeSchema = z.enum(['GENERAL', 'CLUB', 'CHURCH']);

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

	const adminType = await prismaUnscoped.userType.findFirst({ where: { type: 'ROOT' } });
	if (!adminType) {
		res.status(500).json({ error: 'No existe el tipo de usuario ROOT' });
		return;
	}

	const baseSlug = slugify(name) || 'org';
	let slug = baseSlug;
	let suffix = 1;
	while (await prismaUnscoped.tenant.findUnique({ where: { slug } })) {
		suffix += 1;
		slug = `${baseSlug}-${suffix}`;
	}

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
		include: { type: true, tenant: { select: { id: true, name: true, type: true } } },
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
