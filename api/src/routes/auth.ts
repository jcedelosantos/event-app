import { randomBytes, createHash } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { passwordResetRateLimiter } from '../middleware/rate-limit';
import { sendPasswordResetEmail } from '../lib/mail';

export const authRouter = Router();

// Mismo criterio que el claim token de signup.ts (30 min, hash SHA-256, un solo uso) — ver
// User.resetTokenHash en schema.prisma.
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashResetToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

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
		include: { type: true, tenant: { select: { id: true, name: true, type: true, slug: true, logoUrl: true, plan: true, planStatus: true } } },
	});

	if (!user || !(await bcrypt.compare(password, user.password))) {
		res.status(401).json({ error: 'Credenciales inválidas' });
		return;
	}

	// A diferencia del resto de los planStatus !== 'ACTIVE' (solo lectura, ver
	// requireActiveSubscription en middleware/plan.ts), ARCHIVED bloquea también la entrada — es la
	// diferencia real entre "modo consulta" y "archivado" (ver lib/event-plan-expiry.ts y el
	// comentario de Tenant.planStatus en schema.prisma). Reactivar es manual, desde Super Admin.
	if (user.tenant?.planStatus === 'ARCHIVED') {
		res.status(403).json({ error: 'Esta cuenta fue archivada por inactividad. Contactanos para reactivarla.' });
		return;
	}

	const token = signToken({
		userId: user.id,
		username: user.username,
		userType: user.type.type,
		tenantId: user.tenantId,
		scannerEventId: user.scannerEventId,
		accessPointId: user.accessPointId,
		locationId: user.locationId,
	});

	res.json({ token, user: toPublicUser(user) });
}));

// El frontend guarda el token en localStorage pero no persiste el usuario/licencia entre recargas
// de página — sin esto, cualquier chequeo de permiso basado en currentUser (ej. liberar un asiento)
// se "olvidaba" del usuario apenas se refrescaba la pantalla, aunque el token siguiera siendo válido.
authRouter.get('/me', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const user = await prisma.user.findUnique({
		where: { id: req.user!.userId },
		include: { type: true, tenant: { select: { id: true, name: true, type: true, slug: true, logoUrl: true, plan: true, planStatus: true } } },
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
			include: { type: true, tenant: { select: { id: true, name: true, type: true, slug: true, logoUrl: true, plan: true, planStatus: true } } },
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

const forgotPasswordSchema = z.object({ identifier: z.string().min(1) });

// Respuesta genérica SIEMPRE (exista o no una cuenta con ese usuario/email) — sin esto, este
// endpoint dejaría enumerar usernames/emails reales de la plataforma probando uno por uno. El email
// en sí solo se manda si hay match de verdad; quien llama nunca se entera de la diferencia.
authRouter.post('/forgot-password', passwordResetRateLimiter, asyncHandler(async (req, res) => {
	const parsed = forgotPasswordSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: 'Ingresa tu usuario o correo' });
		return;
	}

	const identifier = parsed.data.identifier.trim();
	// Primero por username (el identificador real de login, único en toda la app — ver comentario en
	// schema.prisma). Si no matchea, el usuario probablemente tipeó su email — pero el email NO es
	// único globalmente (la misma persona puede comprar/trabajar en varios tenants con el mismo
	// email), así que ahí puede haber más de una cuenta: se le manda su propio link a cada una.
	const byUsername = await prisma.user.findUnique({ where: { username: identifier } });
	const users = byUsername ? [byUsername] : await prisma.user.findMany({ where: { email: { equals: identifier, mode: 'insensitive' } } });

	for (const user of users) {
		const token = randomBytes(32).toString('hex');
		await prisma.user.update({
			where: { id: user.id },
			data: { resetTokenHash: hashResetToken(token), resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
		});
		const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
		await sendPasswordResetEmail({
			to: user.email,
			username: user.username,
			resetUrl: `${frontendUrl}/login/reset-password?token=${token}`,
		}).catch((err) => console.error('No se pudo enviar el correo de recuperación de contraseña:', err));
	}

	res.json({ ok: true });
}));

const resetPasswordSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(4) });

authRouter.post('/reset-password', passwordResetRateLimiter, asyncHandler(async (req, res) => {
	const parsed = resetPasswordSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const user = await prisma.user.findFirst({ where: { resetTokenHash: hashResetToken(parsed.data.token) } });
	if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
		res.status(400).json({ error: 'El link para restablecer la contraseña venció o ya se usó — pide uno nuevo.' });
		return;
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { password: await bcrypt.hash(parsed.data.newPassword, 10), resetTokenHash: null, resetTokenExpiresAt: null },
	});
	res.json({ ok: true });
}));
