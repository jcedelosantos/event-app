import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';

export const authRouter = Router();

const loginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
});

authRouter.post('/login', asyncHandler(async (req, res) => {
	const parsed = loginSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: 'username y password son requeridos' });
		return;
	}

	const { username, password } = parsed.data;

	const user = await prisma.user.findUnique({
		where: { username },
		include: { type: true },
	});

	if (!user || !(await bcrypt.compare(password, user.password))) {
		res.status(401).json({ error: 'Credenciales inválidas' });
		return;
	}

	const token = signToken({ userId: user.id, username: user.username, userType: user.type.type });

	res.json({ token, user: toPublicUser(user) });
}));
