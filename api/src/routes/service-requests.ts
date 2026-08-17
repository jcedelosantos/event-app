import { Router } from 'express';
import { z } from 'zod';
import { prisma, prismaUnscoped } from '../lib/prisma';
import { requireAuth, requireTenant, requireSuperAdmin, blockScannerRole, AuthenticatedRequest } from '../middleware/auth';
import { requireActiveSubscription } from '../middleware/plan';
import { asyncHandler } from '../lib/async-handler';
import { logAudit } from '../lib/audit';
import { sendServiceRequestNotification } from '../lib/mail';
import { ADDON_SERVICES, isAddOnServiceCode, computeFixedTotalDOP, AddOnServiceCode } from '../lib/addon-services';

// Primer recurso del proyecto con dos audiencias reales (el tenant que pide, el Super Admin que
// cotiza/resuelve) — por eso el auth va por ruta en vez de un router.use() global como el resto
// de los archivos de este directorio.
export const serviceRequestsRouter = Router();

const include = {
	items: true,
	event: { select: { id: true, name: true } },
	requestedBy: { select: { id: true, name: true, lastname: true } },
};

function toPublic(request: any) {
	const totalDOP = computeFixedTotalDOP(request.items.map((i: any) => ({ catalogCode: i.catalogCode, quantity: i.quantity })));
	return { ...request, totalDOP };
}

const itemInputSchema = z.object({
	catalogCode: z.string(),
	quantity: z.number().int().min(1),
});

const createInputSchema = z.object({
	packageCode: z.string().optional(),
	notes: z.string().optional().default(''),
	eventId: z.number().int().optional(),
	items: z.array(itemInputSchema).min(1),
});

serviceRequestsRouter.post(
	'/',
	requireAuth,
	requireTenant,
	blockScannerRole,
	requireActiveSubscription,
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const parsed = createInputSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const tenantId = req.user!.tenantId!;
		const { packageCode, notes, eventId, items } = parsed.data;

		// Cada catalogCode se valida contra el catálogo real y el precio se congela al momento de la
		// solicitud (unitPriceDOPSnapshot) — un cambio de precio en el catálogo después no reescribe
		// silenciosamente lo que el tenant ya pidió.
		for (const item of items) {
			if (!isAddOnServiceCode(item.catalogCode)) {
				res.status(400).json({ error: `Servicio desconocido: ${item.catalogCode}` });
				return;
			}
		}

		if (eventId) {
			const event = await prisma.event.findUnique({ where: { id: eventId, tenantId } });
			if (!event) {
				res.status(400).json({ error: 'Evento no encontrado' });
				return;
			}
		}

		const created = await prisma.serviceRequest.create({
			data: {
				tenantId,
				packageCode,
				notes,
				eventId,
				requestedByUserId: req.user!.userId,
				items: {
					create: items.map((item) => {
						const def = ADDON_SERVICES[item.catalogCode as keyof typeof ADDON_SERVICES];
						return {
							catalogCode: item.catalogCode,
							nameSnapshot: def.name,
							quantity: item.quantity,
							unitPriceDOPSnapshot: def.pricingType === 'FIXED' ? def.unitPriceDOP : null,
						};
					}),
				},
			},
			include,
		});

		await logAudit({
			userId: req.user!.userId,
			action: 'CREATE',
			entity: 'ServiceRequest',
			entityId: created.id,
			summary: `Solicitó servicio adicional (${items.length} ítem${items.length > 1 ? 's' : ''})`,
			tenantId,
		});

		const publicRequest = toPublic(created);
		const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
		sendServiceRequestNotification({
			tenantName: tenant?.name ?? `Tenant ${tenantId}`,
			eventName: created.event?.name ?? null,
			notes,
			totalDOP: publicRequest.totalDOP,
			items: created.items,
		}).catch((err) => console.error('[service-requests] No se pudo enviar el aviso por correo:', err));

		res.status(201).json(publicRequest);
	}),
);

serviceRequestsRouter.get(
	'/',
	requireAuth,
	requireTenant,
	blockScannerRole,
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const tenantId = req.user!.tenantId!;
		const requests = await prisma.serviceRequest.findMany({ where: { tenantId }, include, orderBy: { createdAt: 'desc' } });
		res.json(requests.map(toPublic));
	}),
);

// Solo mientras sigue PENDING — una vez que el Super Admin la cotizó/resolvió, editarla por debajo
// invalidaría silenciosamente lo que ya se cotizó; si el tenant necesita cambiar algo después de eso,
// se resuelve a mano igual que el resto de los flujos "a cotizar/confirmar" de este proyecto.
serviceRequestsRouter.put(
	'/:id',
	requireAuth,
	requireTenant,
	blockScannerRole,
	requireActiveSubscription,
	asyncHandler(async (req: AuthenticatedRequest, res) => {
		const id = Number(req.params.id);
		const tenantId = req.user!.tenantId!;
		const parsed = createInputSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}

		const existing = await prisma.serviceRequest.findUnique({ where: { id } });
		if (!existing || existing.tenantId !== tenantId) {
			res.status(404).json({ error: 'Solicitud no encontrada' });
			return;
		}
		if (existing.status !== 'PENDING') {
			res.status(409).json({ error: 'Esta solicitud ya fue cotizada/resuelta — no se puede modificar.' });
			return;
		}

		const { packageCode, notes, eventId, items } = parsed.data;
		for (const item of items) {
			if (!isAddOnServiceCode(item.catalogCode)) {
				res.status(400).json({ error: `Servicio desconocido: ${item.catalogCode}` });
				return;
			}
		}
		if (eventId) {
			const event = await prisma.event.findUnique({ where: { id: eventId, tenantId } });
			if (!event) {
				res.status(400).json({ error: 'Evento no encontrado' });
				return;
			}
		}

		const updated = await prisma.serviceRequest.update({
			where: { id },
			data: {
				packageCode,
				notes,
				eventId,
				items: {
					deleteMany: {},
					create: items.map((item) => {
						const def = ADDON_SERVICES[item.catalogCode as keyof typeof ADDON_SERVICES];
						return {
							catalogCode: item.catalogCode,
							nameSnapshot: def.name,
							quantity: item.quantity,
							unitPriceDOPSnapshot: def.pricingType === 'FIXED' ? def.unitPriceDOP : null,
						};
					}),
				},
			},
			include,
		});

		await logAudit({
			userId: req.user!.userId,
			action: 'UPDATE',
			entity: 'ServiceRequest',
			entityId: updated.id,
			summary: `Modificó su solicitud de servicio adicional`,
			tenantId,
		});

		res.json(toPublic(updated));
	}),
);

serviceRequestsRouter.get(
	'/admin',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (_req, res) => {
		const requests = await prismaUnscoped.serviceRequest.findMany({
			include: { ...include, tenant: { select: { id: true, name: true } } },
			orderBy: { createdAt: 'desc' },
		});
		res.json(requests.map(toPublic));
	}),
);

const statusUpdateSchema = z.object({
	status: z.enum(['PENDING', 'QUOTED', 'FULFILLED', 'REJECTED']),
	resolutionNote: z.string().optional(),
});

serviceRequestsRouter.put(
	'/:id/status',
	requireAuth,
	requireSuperAdmin,
	asyncHandler(async (req, res) => {
		const id = Number(req.params.id);
		const parsed = statusUpdateSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: parsed.error.flatten() });
			return;
		}
		const { status, resolutionNote } = parsed.data;
		const resolved = status === 'FULFILLED' || status === 'REJECTED';
		const updated = await prismaUnscoped.serviceRequest.update({
			where: { id },
			data: { status, resolutionNote, resolvedAt: resolved ? new Date() : null },
			include: { ...include, tenant: { select: { id: true, name: true } } },
		});

		// Al pasar a FULFILLED con un evento vinculado, esta solicitud se convierte sola en una línea
		// de gasto del ledger del evento (ver EventTransaction en schema.prisma) — así el manager no
		// tiene que volver a cargarla a mano. Si el status cambia a cualquier otra cosa (corrección del
		// Super Admin) se borra la línea generada, ya que dejó de estar resuelta.
		if (status === 'FULFILLED' && updated.eventId != null) {
			const totalDOP = computeFixedTotalDOP(
				updated.items
					.filter((i): i is typeof i & { catalogCode: AddOnServiceCode } => isAddOnServiceCode(i.catalogCode))
					.map((i) => ({ catalogCode: i.catalogCode, quantity: i.quantity })),
			);
			const category = updated.items.length === 1 ? updated.items[0].nameSnapshot : 'Servicios adicionales';
			await prismaUnscoped.eventTransaction.upsert({
				where: { serviceRequestId: id },
				create: {
					type: 'EXPENSE',
					category,
					amountCents: Math.round(totalDOP * 100),
					source: 'AUTOMATIC',
					eventId: updated.eventId,
					tenantId: updated.tenantId,
					serviceRequestId: id,
				},
				update: { category, amountCents: Math.round(totalDOP * 100) },
			});
		} else {
			await prismaUnscoped.eventTransaction.deleteMany({ where: { serviceRequestId: id } });
		}

		res.json(toPublic(updated));
	}),
);
