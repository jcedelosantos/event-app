import { normalizeCarnet } from './attendee';

// Estructural en vez de tipado contra PrismaClient/TransactionClient — mismo motivo que
// lib/capacity.ts y lib/host-guest.ts. Sin default a `prisma` a propósito — se exige pasar el `tx`
// explícito para que este chequeo quede DENTRO de la misma transacción serializable que crea el
// SaleTicket (ver sale-tickets.ts/public.ts).
type DuplicateGuardClient = {
	event: {
		findUnique: (args: any) => Promise<{ duplicateGroupKey: string | null } | null>;
		findMany: (args: any) => Promise<{ id: number; name: string }[]>;
	};
	saleTicket: { findMany: (args: any) => Promise<{ eventId: number; client: { email: string; carnet: string | null } }[]> };
};

// "Misma función, otra fecha" (ver Event.duplicateGroupKey, solo tiene sentido en tenants CLUB): un
// socio o invitado que ya se registró en uno de los eventos de un grupo no puede volver a
// registrarse en otro del mismo grupo. Identifica a la persona por email (identidad ya dedupeada de
// User por tenant) y, si cargó carnet, también por carnet normalizado — cubre tanto al socio (que
// siempre tiene carnet) como a un invitado que en otra compra haya completado el suyo.
export async function checkDuplicateEventRegistration(
	db: DuplicateGuardClient,
	params: { tenantId: number; eventId: number; clientEmail: string; clientCarnet?: string | null },
): Promise<string | null> {
	const event = await db.event.findUnique({
		where: { id: params.eventId, tenantId: params.tenantId },
		select: { duplicateGroupKey: true },
	});
	if (!event?.duplicateGroupKey) return null;

	const siblingEvents = await db.event.findMany({
		where: { tenantId: params.tenantId, duplicateGroupKey: event.duplicateGroupKey, id: { not: params.eventId } },
		select: { id: true, name: true },
	});
	if (!siblingEvents.length) return null;

	const normalizedEmail = params.clientEmail.trim().toLowerCase();
	const normalizedCarnet = params.clientCarnet?.trim() ? normalizeCarnet(params.clientCarnet) : null;

	const siblingSales = await db.saleTicket.findMany({
		where: { tenantId: params.tenantId, eventId: { in: siblingEvents.map((e) => e.id) } },
		select: { eventId: true, client: { select: { email: true, carnet: true } } },
	});

	const match = siblingSales.find(
		(sale) =>
			sale.client.email.trim().toLowerCase() === normalizedEmail ||
			(normalizedCarnet !== null && normalizeCarnet(sale.client.carnet ?? '') === normalizedCarnet),
	);
	if (!match) return null;

	const siblingEvent = siblingEvents.find((e) => e.id === match.eventId);
	return `Ya está registrado/a en "${siblingEvent?.name ?? 'otra función'}" — no se puede registrar en ambas funciones del mismo evento.`;
}
