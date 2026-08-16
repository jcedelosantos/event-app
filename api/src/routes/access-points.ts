import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireTenant, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';

export const accessPointsRouter = Router();
accessPointsRouter.use(requireAuth, requireTenant, requireActiveSubscription);

const accessPointInputSchema = z.object({
	name: z.string().min(1),
	active: z.boolean().optional().default(true),
	eventId: z.number().int(),
	// Set completo de tickets permitidos — ausente/undefined = sin restricción (allow-by-default,
	// ver AccessPointTicket en schema.prisma). [] explícito también significa "sin restricción" hoy
	// (mismo comportamiento que no mandar el campo) porque scan.ts trata "cero filas" como abierto.
	ticketIds: z.array(z.number().int()).optional(),
});

const include = {
	allowedTickets: { select: { ticketId: true } },
	// El escáner (qr-scanner.component.ts) NO está acotado a un evento — lista las puertas de TODO
	// el tenant para elegir de una — así que necesita el nombre del evento para distinguir puertas
	// de mismo nombre en eventos distintos (ej. "VIP" en dos galas seguidas).
	event: { select: { id: true, name: true } },
};

function toPublicAccessPoint<T extends { allowedTickets: { ticketId: number }[] }>(accessPoint: T) {
	const { allowedTickets, ...rest } = accessPoint;
	return { ...rest, ticketIds: allowedTickets.map((t) => t.ticketId) };
}

// Sin blockScannerRole a propósito, a diferencia de todos los demás endpoints de este archivo — el
// selector de puerta del scanner (qr-scanner.component.ts) necesita esta lista, es la ÚNICA lectura
// que un usuario SCANNER tiene permitida fuera de /scan (ver middleware/auth.ts).
accessPointsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = req.query.eventId ? Number(req.query.eventId) : undefined;
	const accessPoints = await prisma.accessPoint.findMany({
		where: eventId ? { eventId, tenantId } : { tenantId },
		include,
		orderBy: { id: 'asc' },
	});
	res.json(accessPoints.map(toPublicAccessPoint));
}));

const RECENT_WINDOW_MINUTES = 5;

// Tráfico por puerta para el dashboard en vivo — agregado server-side (nunca trae los SaleTicket
// completos al cliente). checkedIn = total histórico del evento por esa puerta; recentCount = los
// últimos RECENT_WINDOW_MINUTES minutos, insumo para la tasa por minuto y la alerta de
// concentración que calcula el frontend.
accessPointsRouter.get('/stats', blockScannerRole, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const tenantId = req.user!.tenantId!;
	const eventId = Number(req.query.eventId);
	if (!eventId) {
		res.status(400).json({ error: 'Falta eventId' });
		return;
	}

	const recentSince = new Date(Date.now() - RECENT_WINDOW_MINUTES * 60 * 1000);
	const [accessPoints, totalGrouped, recentGrouped, eventTotal] = await Promise.all([
		prisma.accessPoint.findMany({ where: { eventId, tenantId }, select: { id: true, name: true, active: true }, orderBy: { id: 'asc' } }),
		prisma.saleTicket.groupBy({ by: ['accessPointId'], where: { eventId, tenantId, checkedInAt: { not: null } }, _count: { _all: true } }),
		prisma.saleTicket.groupBy({ by: ['accessPointId'], where: { eventId, tenantId, checkedInAt: { gte: recentSince } }, _count: { _all: true } }),
		prisma.saleTicket.count({ where: { eventId, tenantId, checkedInAt: { not: null } } }),
	]);

	const totalById = new Map(totalGrouped.map((g) => [g.accessPointId, g._count._all]));
	const recentById = new Map(recentGrouped.map((g) => [g.accessPointId, g._count._all]));

	res.json({
		eventTotal,
		windowMinutes: RECENT_WINDOW_MINUTES,
		accessPoints: accessPoints.map((ap) => ({
			...ap,
			checkedIn: totalById.get(ap.id) ?? 0,
			recentCount: recentById.get(ap.id) ?? 0,
		})),
	});
}));

accessPointsRouter.post('/', blockScannerRole, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const parsed = accessPointInputSchema.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const tenantId = req.user!.tenantId!;
	const { ticketIds, ...data } = parsed.data;
	try {
		const created = await prisma.accessPoint.create({
			data: {
				...data,
				tenantId,
				...(ticketIds?.length ? { allowedTickets: { create: ticketIds.map((ticketId) => ({ ticketId })) } } : {}),
			},
			include,
		});
		await logAudit({ tenantId, userId: req.user!.userId, action: 'CREATE', entity: 'AccessPoint', entityId: created.id, summary: `Creó la puerta "${created.name}"` });
		res.status(201).json(toPublicAccessPoint(created));
	} catch (err: any) {
		if (err.code === 'P2003') {
			res.status(400).json({ error: 'El evento indicado no existe' });
			return;
		}
		throw err;
	}
}));

accessPointsRouter.put('/:id', blockScannerRole, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;
	const parsed = accessPointInputSchema.partial().safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: parsed.error.flatten() });
		return;
	}

	const { ticketIds, ...data } = parsed.data;
	try {
		// Reemplazo completo del allow-list en una sola operación (más simple para el frontend que
		// mandar un diff): borra todas las filas actuales y crea las nuevas, sólo si el campo vino en
		// el body — omitirlo deja el allow-list como está (ej. un PUT que solo cambia `active`).
		const updated = await prisma.$transaction(async (tx: any) => {
			await tx.accessPoint.update({ where: { id, tenantId }, data });
			if (ticketIds !== undefined) {
				await tx.accessPointTicket.deleteMany({ where: { accessPointId: id } });
				if (ticketIds.length) {
					await tx.accessPointTicket.createMany({ data: ticketIds.map((ticketId: number) => ({ accessPointId: id, ticketId })) });
				}
			}
			return tx.accessPoint.findUniqueOrThrow({ where: { id, tenantId }, include });
		});
		await logAudit({ tenantId, userId: req.user!.userId, action: 'UPDATE', entity: 'AccessPoint', entityId: id, summary: `Editó la puerta "${updated.name}"` });
		res.json(toPublicAccessPoint(updated));
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Puerta no encontrada' });
			return;
		}
		throw err;
	}
}));

accessPointsRouter.delete('/:id', blockScannerRole, asyncHandler(async (req: AuthenticatedRequest, res) => {
	const id = Number(req.params.id);
	const tenantId = req.user!.tenantId!;

	try {
		const accessPoint = await prisma.accessPoint.delete({ where: { id, tenantId } });
		await logAudit({ tenantId, userId: req.user!.userId, action: 'DELETE', entity: 'AccessPoint', entityId: id, summary: `Borró la puerta "${accessPoint.name}"` });
		res.status(204).send();
	} catch (err: any) {
		if (err.code === 'P2025') {
			res.status(404).json({ error: 'Puerta no encontrada' });
			return;
		}
		throw err;
	}
}));
