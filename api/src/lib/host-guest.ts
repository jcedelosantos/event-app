// Estructural en vez de tipado contra PrismaClient/TransactionClient — mismo motivo que
// lib/capacity.ts: el `tx` real que entra acá viene de un cliente extendido (tenant-guard) cuyo
// tipo generado no encaja limpio con Prisma.TransactionClient, pero el subconjunto de métodos que
// hace falta sí calza. Sin default a `prisma` a propósito (ver capacity.ts) — se exige pasar el
// `tx` explícito para que esta regla quede DENTRO de la misma transacción serializable que crea el
// SaleTicket (ver sale-tickets.ts); bajo Postgres, dos ventas de invitado del anfitrión al mismo
// tiempo podrían leer el mismo conteo antes de que ninguna termine de escribir si corriera afuera.
type HostGuestCheckClient = {
	event: { findUnique: (args: any) => Promise<{ hostName: string | null; maxHostGuests: number | null } | null> };
	saleTicket: { count: (args: any) => Promise<number> };
};

// Solo tiene sentido si el evento tiene un anfitrión configurado (ver Event.hostName/
// maxHostGuests) — un walk-in que llega diciendo "me invitó fulano" cuenta contra ese tope, sin
// necesitar carnet ni registro previo (a diferencia de socio/invitado en clubes, esto es siempre
// una venta manual del manager en la puerta, nunca autoservicio público).
export async function validateHostGuestRule(
	db: HostGuestCheckClient,
	params: { tenantId: number; eventId: number; isHostGuest: boolean | undefined },
): Promise<string | null> {
	if (!params.isHostGuest) return null;

	const event = await db.event.findUnique({
		where: { id: params.eventId, tenantId: params.tenantId },
		select: { hostName: true, maxHostGuests: true },
	});
	if (!event?.hostName || event.maxHostGuests == null) {
		return 'Este evento no tiene un anfitrión con invitados configurado.';
	}

	const existingHostGuests = await db.saleTicket.count({
		where: { eventId: params.eventId, tenantId: params.tenantId, isHostGuest: true },
	});
	if (existingHostGuests + 1 > event.maxHostGuests) {
		return `El anfitrión ${event.hostName} ya alcanzó su máximo de ${event.maxHostGuests} invitados para este evento.`;
	}
	return null;
}
