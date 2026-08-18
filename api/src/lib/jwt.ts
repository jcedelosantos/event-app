import jwt from 'jsonwebtoken';

// Sin fallback: un default hardcodeado es un secreto público — si esta env var alguna vez se pierde
// en el deploy, mejor que el proceso ni arranque a que arranque emitiendo/aceptando JWTs firmados con
// un valor que cualquiera puede leer en el código fuente (incluye tokens de Super Admin).
if (!process.env.JWT_SECRET) {
	throw new Error('JWT_SECRET no está seteada — ver api/.env.example.');
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export type AuthTokenPayload = {
	userId: number;
	username: string;
	userType: string;
	// null solo para la cuenta de Super Admin (gestiona /tenants, no pertenece a ningún cliente).
	// Cualquier otra ruta de negocio filtra TODO por este valor.
	tenantId: number | null;
	// Solo tiene valor real cuando userType === 'SCANNER' (ver User.scannerEventId en schema.prisma)
	// — va en el token (no se resuelve contra la DB en cada request) porque POST /scan es de las
	// rutas más frecuentes de toda la app, a diferencia de license.ts que sí puede permitirse el
	// roundtrip extra. undefined/null para cualquier otro tipo de usuario.
	scannerEventId?: number | null;
	// Igual que scannerEventId pero opcional dentro de SCANNER — si está seteado, fija al operador a
	// UNA sola puerta del evento (ver User.accessPointId). null/undefined = puede elegir cualquier
	// puerta del evento asignado, comportamiento previo a este campo.
	accessPointId?: number | null;
	// Sede a la que queda restringido este usuario (ver User.locationId/Location) — a diferencia de
	// scannerEventId, disponible para cualquier tipo de usuario, no solo SCANNER. null/undefined = sin
	// restricción, ve todo el tenant (comportamiento de siempre para un tenant sin sedes).
	locationId?: number | null;
};

export function signToken(payload: AuthTokenPayload): string {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): AuthTokenPayload {
	return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}
