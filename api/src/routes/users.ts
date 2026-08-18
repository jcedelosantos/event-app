import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { toPublicUser } from '../lib/serialize';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireTenant, blockScannerRole, requireActiveSubscription);

// SCANNER (ver User.scannerEventId, middleware/auth.ts blockScannerRole) queda restringido a
// escanear un solo evento — a diferencia del resto de los tipos, requiere el campo extra
// scannerEventId (ver validateScannerEventId más abajo).
const USER_TYPE_CODES = ['ROOT', 'USER', 'CLIENT', 'SCANNER'] as const;

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
	// Solo se usa (y se exige) cuando userType === 'SCANNER' — ver validateScannerEventId.
	scannerEventId: z.number().int().nullable().optional(),
	// Opcional incluso para SCANNER — fija al operador a UNA puerta del evento asignado (kiosco
	// fijo) en vez de dejarlo elegir. Ver validateAccessPointId.
	accessPointId: z.number().int().nullable().optional(),
	// Restringe a este usuario a UNA sede (ver Location) — a diferencia de scannerEventId/
	// accessPointId, disponible para CUALQUIER userType, no solo SCANNER. Ver validateLocationId.
	locationId: z.number().int().nullable().optional(),
});

// Devuelve el error a mostrar, o null si está todo bien. effectiveUserType es el tipo que el
// usuario va a tener DESPUÉS de este request — en un PUT parcial que no toca userType, es el tipo
// que ya tenía antes (lo resuelve el caller). Para SCANNER, scannerEventId es obligatorio y tiene
// que ser un evento real de este tenant; para cualquier otro tipo, se ignora lo que se haya
// mandado (nunca se persiste un scannerEventId huérfano en un usuario que no es SCANNER).
async function validateScannerEventId(tenantId: number, effectiveUserType: string, scannerEventId: number | null | undefined): Promise<{ error: string } | { scannerEventId: number | null }> {
	if (effectiveUserType !== 'SCANNER') return { scannerEventId: null };
	if (scannerEventId == null) return { error: 'Un usuario tipo Escáner necesita un evento asignado.' };
	const event = await prisma.event.findFirst({ where: { id: scannerEventId, tenantId }, select: { id: true } });
	if (!event) return { error: 'El evento asignado no existe en esta organización.' };
	return { scannerEventId };
}

// Igual que validateScannerEventId pero opcional: un SCANNER puede quedar sin puerta asignada (elige
// entre las del evento en el momento de escanear) o fijado a una sola (kiosco fijo). Si se manda,
// tiene que pertenecer al MISMO evento que effectiveScannerEventId — una puerta de otro evento del
// tenant no sirve de nada acá y solo confundiría al operador.
async function validateAccessPointId(
	tenantId: number,
	effectiveUserType: string,
	effectiveScannerEventId: number | null,
	accessPointId: number | null | undefined,
): Promise<{ error: string } | { accessPointId: number | null }> {
	if (effectiveUserType !== 'SCANNER' || accessPointId == null) return { accessPointId: null };
	const accessPoint = await prisma.accessPoint.findFirst({ where: { id: accessPointId, tenantId, eventId: effectiveScannerEventId ?? -1 }, select: { id: true } });
	if (!accessPoint) return { error: 'La puerta asignada no pertenece al evento asignado.' };
	return { accessPointId };
}

// Más simple que validateScannerEventId: sin rama condicional por rol, cualquier tipo de usuario
// puede quedar restringido a una sede. undefined/null = sin restricción (comportamiento de siempre).
async function validateLocationId(tenantId: number, locationId: number | null | undefined): Promise<{ error: string } | { locationId: number | null }> {
	if (locationId == null) return { locationId: null };
	const location = await prisma.location.findFirst({ where: { id: locationId, tenantId }, select: { id: true } });
	if (!location) return { error: 'La sede asignada no existe en esta organización.' };
	return { locationId };
}

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
	const { userType, password, scannerEventId, accessPointId, locationId, ...data } = parsed.data;
	const type = await prisma.userType.findFirst({ where: { type: userType } });
	if (!type) {
		res.status(400).json({ error: `Tipo de usuario desconocido: ${userType}` });
		return;
	}
	const scannerResult = await validateScannerEventId(tenantId, userType, scannerEventId);
	if ('error' in scannerResult) {
		res.status(400).json({ error: scannerResult.error });
		return;
	}
	const accessPointResult = await validateAccessPointId(tenantId, userType, scannerResult.scannerEventId, accessPointId);
	if ('error' in accessPointResult) {
		res.status(400).json({ error: accessPointResult.error });
		return;
	}
	const locationResult = await validateLocationId(tenantId, locationId);
	if ('error' in locationResult) {
		res.status(400).json({ error: locationResult.error });
		return;
	}

	try {
		const hashed = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				...data,
				password: hashed,
				typeId: type.id,
				tenantId,
				scannerEventId: scannerResult.scannerEventId,
				accessPointId: accessPointResult.accessPointId,
				locationId: locationResult.locationId,
			},
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

	const existing = await prisma.user.findFirst({ where: { id, tenantId }, include: { type: true } });
	if (!existing) {
		res.status(404).json({ error: 'Usuario no encontrado' });
		return;
	}

	const { userType, password, scannerEventId, accessPointId, locationId, ...data } = parsed.data;
	const typeId = userType ? (await prisma.userType.findFirst({ where: { type: userType } }))?.id : undefined;
	// Un PUT parcial puede no tocar userType (ej. solo cambia el nombre) — el tipo "efectivo" para
	// decidir si scannerEventId aplica es el que va a quedar DESPUÉS de este request: el nuevo si
	// vino, si no el que ya tenía.
	const effectiveUserType = userType ?? existing.type.type;
	const scannerResult = await validateScannerEventId(tenantId, effectiveUserType, scannerEventId ?? (userType ? undefined : existing.scannerEventId));
	if ('error' in scannerResult) {
		res.status(400).json({ error: scannerResult.error });
		return;
	}
	const accessPointResult = await validateAccessPointId(tenantId, effectiveUserType, scannerResult.scannerEventId, accessPointId ?? (scannerEventId !== undefined || userType ? undefined : existing.accessPointId));
	if ('error' in accessPointResult) {
		res.status(400).json({ error: accessPointResult.error });
		return;
	}
	const locationResult = await validateLocationId(tenantId, locationId ?? existing.locationId);
	if ('error' in locationResult) {
		res.status(400).json({ error: locationResult.error });
		return;
	}

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
				scannerEventId: scannerResult.scannerEventId,
				accessPointId: accessPointResult.accessPointId,
				locationId: locationResult.locationId,
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
