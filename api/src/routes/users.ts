import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const USER_TYPE_CODES = ['ROOT', 'USER', 'CLIENT'] as const;

const userInputSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(4).optional(),
	name: z.string().min(1),
	lastname: z.string().min(1),
	gender: z.string().min(1),
	email: z.string().email(),
	carnet: z.string().min(1),
	adress: z.string(),
	phone: z.string(),
	userType: z.enum(USER_TYPE_CODES),
});

usersRouter.get('/', asyncHandler(async (_req, res) => {
	const users = await prisma.user.findMany({ include: { type: true }, orderBy: { id: 'asc' } });
	res.json(users.map(toPublicUser));
}));

usersRouter.get('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const user = await prisma.user.findUnique({ where: { id }, include: { type: true } });
	if (!user) {
		res.status(404).json({ error: 'Usuario no encontrado' });
		return;
	}
	res.json(toPublicUser(user));
}));

usersRouter.post('/', asyncHandler(async (req, res) => {
	const parsed = userInputSchema.required({ password: true }).safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { userType, password, ...data } = parsed.data;
	const type = await prisma.userType.findFirst({ where: { type: userType } });
	if (!type) {
		res.status(400).json({ error: `Tipo de usuario desconocido: ${userType}` });
		return;
	}

	try {
		const hashed = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: { ...data, password: hashed, typeId: type.id },
			include: { type: true },
		});
		res.status(201).json(toPublicUser(user));
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'username o email ya en uso' });
			return;
		}
		throw err;
	}
}));

usersRouter.put('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);
	const parsed = userInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { userType, password, ...data } = parsed.data;
	const typeId = userType ? (await prisma.userType.findFirst({ where: { type: userType } }))?.id : undefined;

	try {
		const user = await prisma.user.update({
			where: { id },
			data: {
				...data,
				...(password ? { password: await bcrypt.hash(password, 10) } : {}),
				...(typeId ? { typeId } : {}),
			},
			include: { type: true },
		});
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

usersRouter.delete('/:id', asyncHandler(async (req, res) => {
	const id = Number(req.params.id);

	const [eventCount, sellerCount, clientCount] = await Promise.all([
		prisma.event.count({ where: { userId: id } }),
		prisma.saleTicket.count({ where: { userId: id } }),
		prisma.saleTicket.count({ where: { clientId: id } }),
	]);
	if (eventCount > 0 || sellerCount > 0 || clientCount > 0) {
		res.status(409).json({ error: 'No se puede borrar: este usuario tiene eventos o ventas asociadas.' });
		return;
	}

	try {
		await prisma.user.delete({ where: { id } });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Usuario no encontrado' });
			return;
		}
		throw err;
	}
}));
