import { NextFunction, Request, Response } from 'express';
import { AuthTokenPayload, verifyToken } from '../lib/jwt';

export interface AuthenticatedRequest extends Request {
	user?: AuthTokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
	const header = req.headers.authorization;
	const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

	if (!token) {
		res.status(401).json({ error: 'Missing Authorization header' });
		return;
	}

	try {
		req.user = verifyToken(token);
		next();
	} catch (err) {
		// Diagnóstico para el reporte real de logout inesperado guardando un evento — no se pudo
		// reproducir el defecto por revisión de código sola (JWT_SECRET estable, expiresIn 8h en login
		// e impersonate por igual, GETs con el mismo token funcionando segundos antes del PUT que
		// falló). Si vuelve a pasar, este log dice exactamente por qué falló verifyToken en vez de
		// tener que reconstruir la hipótesis a partir de logs HTTP de Railway.
		const name = err instanceof Error ? err.name : 'UnknownError';
		console.error(`requireAuth: token rechazado (${name}) en ${req.method} ${req.originalUrl}`);
		res.status(401).json({ error: 'Invalid or expired token' });
	}
}

// Todas las rutas de negocio (eventos, mapas, tickets, ventas...) necesitan un tenant real para
// poder filtrar por él — la única cuenta sin tenant es el Super Admin, que solo debe poder operar
// /tenants. Se corre siempre DESPUÉS de requireAuth.
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
	if (req.user?.tenantId == null) {
		res.status(403).json({ error: 'Esta cuenta no pertenece a ninguna organización.' });
		return;
	}
	next();
}

// Inverso de requireTenant: solo la cuenta de Super Admin (tenantId null) puede administrar
// /tenants — cualquier cuenta de un cliente normal recibe 403, aunque tenga el JWT válido.
export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
	if (req.user?.tenantId != null) {
		res.status(403).json({ error: 'Esta acción requiere una cuenta de Super Admin.' });
		return;
	}
	next();
}
