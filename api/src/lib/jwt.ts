import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-in-production';

export type AuthTokenPayload = {
	userId: number;
	username: string;
	userType: string;
	// null solo para la cuenta de Super Admin (gestiona /tenants, no pertenece a ningún cliente).
	// Cualquier otra ruta de negocio filtra TODO por este valor.
	tenantId: number | null;
};

export function signToken(payload: AuthTokenPayload): string {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): AuthTokenPayload {
	return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}
