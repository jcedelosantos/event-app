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
	} catch {
		res.status(401).json({ error: 'Invalid or expired token' });
	}
}
