import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

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
		include: { type: true, tenant: { select: { id: true, name: true, type: true } } },
	});

	if (!user || !(await bcrypt.compare(password, user.password))) {
		res.status(401).json({ error: 'Credenciales inválidas' });
		return;
	}

	const token = signToken({ userId: user.id, username: user.username, userType: user.type.type, tenantId: user.tenantId });

	res.json({ token, user: toPublicUser(user) });
}));

// El frontend guarda el token en localStorage pero no persiste el usuario/licencia entre recargas
// de página — sin esto, cualquier chequeo de permiso basado en currentUser (ej. liberar un asiento)
// se "olvidaba" del usuario apenas se refrescaba la pantalla, aunque el token siguiera siendo válido.
authRouter.get('/me', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const user = await prisma.user.findUnique({
		where: { id: req.user!.userId },
		include: { type: true, tenant: { select: { id: true, name: true, type: true } } },
	});
	if (!user) {
		res.status(401).json({ error: 'No autenticado' });
		return;
	}
	res.json(toPublicUser(user));
}));

const updateMeSchema = z.object({
	username: z.string().min(1).optional(),
	currentPassword: z.string().min(1).optional(),
	newPassword: z.string().min(4).optional(),
});

// Autogestión de la propia cuenta (username/contraseña) — separado de users.ts porque ese CRUD
// requiere tenant y permisos de manager; esto lo puede usar CUALQUIER cuenta autenticada, incluido
// el Super Admin (que no pertenece a ningún tenant y por eso no tiene acceso a /users). Cambiar la
// contraseña exige la contraseña actual para no permitir que una sesión robada la cambie sin más.
authRouter.put('/me', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = updateMeSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
	if (!user) {
		res.status(401).json({ error: 'No autenticado' });
		return;
	}

	const data: { username?: string; password?: string } = {};
	if (parsed.data.username) {
		data.username = parsed.data.username;
	}
	if (parsed.data.newPassword) {
		if (!parsed.data.currentPassword || !(await bcrypt.compare(parsed.data.currentPassword, user.password))) {
			res.status(400).json({ error: 'La contraseña actual no es correcta' });
			return;
		}
		data.password = await bcrypt.hash(parsed.data.newPassword, 10);
	}

	try {
		const updated = await prisma.user.update({
			where: { id: user.id },
			data,
			include: { type: true, tenant: { select: { id: true, name: true, type: true } } },
		});
		res.json(toPublicUser(updated));
	} catch (err: any) {
		if (err.code === 'P2002') {
			res.status(409).json({ error: 'Ese username ya está en uso' });
			return;
		}
		throw err;
	}
}));
