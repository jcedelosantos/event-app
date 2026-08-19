import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireApiKey, ApiKeyRequest } from '../middleware/api-key';
import { publicApiRateLimiter } from '../middleware/rate-limit';
import { asyncHandler } from '../lib/async-handler';

// API pública de integración para tenants Enterprise (ver ApiKey en el schema, lib/api-key.ts,
// middleware/api-key.ts, routes/api-keys.ts para la gestión de claves desde el manager). Namespace
// versionado (/api/v1) y de solo lectura a propósito — sin partner real pidiendo escritura todavía
// (ver el plan de Fase 3), exponer lecturas primero es lo único que se puede validar sin riesgo de
// que una integración externa deje datos a medio escribir.
export const publicApiRouter = Router();
publicApiRouter.use(requireApiKey, publicApiRateLimiter);

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function parsePagination(req: ApiKeyRequest) {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.limit) || DEFAULT_PAGE_SIZE));
	return { page, limit, skip: (page - 1) * limit };
}

const eventSelect = {
	id: true,
	name: true,
	code: true,
	type: true,
	dateOn: true,
	dateOff: true,
	startTime: true,
	status: true,
	active: true,
} as const;

publicApiRouter.get('/events', asyncHandler(async (req: ApiKeyRequest, res) => {
	const tenantId = req.apiKeyTenantId!;
	const { page, limit, skip } = parsePagination(req);
	const where = { tenantId };
	const [events, total] = await Promise.all([
		prisma.event.findMany({ where, select: eventSelect, orderBy: { dateOn: 'desc' }, skip, take: limit }),
		prisma.event.count({ where }),
	]);
	res.json({ data: events, page, limit, total });
}));

publicApiRouter.get('/events/:id', asyncHandler(async (req: ApiKeyRequest, res) => {
	const tenantId = req.apiKeyTenantId!;
	const id = Number(req.params.id);
	const event = await prisma.event.findUnique({ where: { id, tenantId }, select: eventSelect });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}
	res.json(event);
}));

// Ventas de un evento puntual — no el equivalente a GET /sale-tickets del manager (que trae al
// vendedor y datos internos): acá solo lo que le sirve a un sistema externo para reconciliar
// asistencia (tipo de ticket, comprador, estado de check-in), nunca el vendedor ni campos internos.
publicApiRouter.get('/events/:id/tickets', asyncHandler(async (req: ApiKeyRequest, res) => {
	const tenantId = req.apiKeyTenantId!;
	const eventId = Number(req.params.id);
	const event = await prisma.event.findUnique({ where: { id: eventId, tenantId }, select: { id: true } });
	if (!event) {
		res.status(404).json({ error: 'Evento no encontrado' });
		return;
	}

	const { page, limit, skip } = parsePagination(req);
	const where = { tenantId, eventId };
	const [saleTickets, total] = await Promise.all([
		prisma.saleTicket.findMany({
			where,
			select: {
				id: true,
				codeQR: true,
				dateSold: true,
				checkedInAt: true,
				paidType: true,
				ticket: { select: { name: true } },
				client: { select: { name: true, lastname: true, email: true } },
			},
			orderBy: { id: 'desc' },
			skip,
			take: limit,
		}),
		prisma.saleTicket.count({ where }),
	]);
	res.json({ data: saleTickets, page, limit, total });
}));
