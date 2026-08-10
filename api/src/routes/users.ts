import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireTenant, requireActiveSubscription);

const USER_TYPE_CODES = ['ROOT', 'USER', 'CLIENT'] as const;

const userInputSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(4).optional(),
	name: z.string().min(1),
	lastname: z.string().min(1),
	// Sin .min(1): socios dados de alta por vía rápida o importados ya vienen sin este dato, y
	// bloquear la edición de otros campos hasta completarlo es peor que aceptarlo vacío.
	gender: z.string(),
	email: z.string().email(),
	// No todos los tenants usan carnet como identificador (solo CLUB lo exige de verdad, al
	// vender un ticket vía validateAttendeeRule) — acá se acepta vacío para no bloquear la
	// creación de usuarios en tenants tipo CHURCH/GENERAL.
	carnet: z.string().optional().default(''),
	adress: z.string(),
	phone: z.string(),
	userType: z.enum(USER_TYPE_CODES),
});

usersRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const users = await prisma.user.findMany({ where: { tenantId }, include: { type: true }, orderBy: { id: 'asc' } });
	res.json(users.map(toPublicUser));
}));

usersRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const user = await prisma.user.findFirst({ where: { id, tenantId }, include: { type: true } });
	if (!user) {
		res.status(404).json({ error: 'Usuario no encontrado' });
		return;
	}
	res.json(toPublicUser(user));
}));

usersRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = userInputSchema.required({ password: true }).safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	const { userType, password, ...data } = parsed.data;
	const type = await prisma.userType.findFirst({ where: { type: userType } });
	if (!type) {
		res.status(400).json({ error: `Tipo de usuario desconocido: ${userType}` });
		return;
	}

	try {
		const hashed = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: { ...data, password: hashed, typeId: type.id, tenantId },
			include: { type: true },
		});
		await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'User', entityId: user.id, summary: `Creó el usuario "${user.username}"` });
		res.status(201).json(toPublicUser(user));
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'username o email ya en uso' });
			return;
		}
		throw err;
	}
}));

usersRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = userInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const existing = await prisma.user.findFirst({ where: { id, tenantId } });
	if (!existing) {
		res.status(404).json({ error: 'Usuario no encontrado' });
		return;
	}

	const { userType, password, ...data } = parsed.data;
	const typeId = userType ? (await prisma.userType.findFirst({ where: { type: userType } }))?.id : undefined;

	try {
		// `tenantId` en el where (además del `findFirst` de arriba) — User no está en tenant-guard
		// (ver lib/tenant-guard.ts), así que esta es la única red de seguridad si el `findFirst` de
		// arriba alguna vez se reordena o se borra en un refactor futuro.
		const user = await prisma.user.update({
			where: { id, tenantId },
			data: {
				...data,
				...(password ? { password: await bcrypt.hash(password, 10) } : {}),
				...(typeId ? { typeId } : {}),
			},
			include: { type: true },
		});
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'User', entityId: user.id, summary: `Editó el usuario "${user.username}"` });
		res.json(toPublicUser(user));
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Usuario no encontrado' });
			return;
		}
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'username o email ya en uso' });
			return;
		}
		throw err;
	}
}));

usersRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	const existing = await prisma.user.findFirst({ where: { id, tenantId } });
	if (!existing) {
		res.status(404).json({ error: 'Usuario no encontrado' });
		return;
	}

	const [eventCount, sellerCount, clientCount] = await Promise.all([
		prisma.event.count({ where: { userId: id, tenantId } }),
		prisma.saleTicket.count({ where: { userId: id, tenantId } }),
		prisma.saleTicket.count({ where: { clientId: id, tenantId } }),
	]);
	if (eventCount > 0 || sellerCount > 0 || clientCount > 0) {
		res.status(409).json({ error: 'No se puede borrar: este usuario tiene eventos o ventas asociadas.' });
		return;
	}

	try {
		// Mismo motivo que el PUT de arriba: `tenantId` en el where como red de seguridad adicional.
		const user = await prisma.user.delete({ where: { id, tenantId } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'DELETE', entity: 'User', entityId: id, summary: `Borró el usuario "${user.username}"` });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Usuario no encontrado' });
			return;
		}
		throw err;
	}
}));
