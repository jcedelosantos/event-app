import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from './auth';

// UserType.license es un array de códigos de permiso (JSON-encoded en SQLite); '*' es wildcard
// (todo permitido, el rol Admin lo trae por defecto). El JWT solo carga el nombre del tipo, no la
// licencia, así que hay que resolverla contra la DB en cada request — aceptable para acciones poco
// frecuentes como liberar un asiento, no vale la pena cachearla en el token por esto.
export async function hasLicense(userId: number, code: string): Promise<boolean> {
	const user = await prisma.user.findUnique({ where: { id: userId }, include: { type: true } });
	if (!user) return false;
	const license = JSON.parse(user.type.license) as string[];
	return license.includes('*') || license.includes(code);
}

export function requireLicense(code: string) {
	return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
		const userId = req.user?.userId;
		if (!userId) {
			res.status(401).json({ error: 'No autenticado' });
			return;
		}

		if (!(await hasLicense(userId, code))) {
			res.status(403).json({ error: 'Tu usuario no tiene permiso para esta acción.' });
			return;
		}

		next();
	};
}
