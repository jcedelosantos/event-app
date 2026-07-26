import { prisma } from './prisma';

// Solo tiene sentido si el evento tiene un anfitrión configurado (ver Event.hostName/
// maxHostGuests) — un walk-in que llega diciendo "me invitó fulano" cuenta contra ese tope, sin
// necesitar carnet ni registro previo (a diferencia de socio/invitado en clubes, esto es siempre
// una venta manual del manager en la puerta, nunca autoservicio público).
export async function validateHostGuestRule(params: { tenantId: number; eventId: number; isHostGuest: boolean | undefined }): Promise<string | null> {
	if (!params.isHostGuest) return null;

	const event = await prisma.event.findUnique({
		where: { id: params.eventId, tenantId: params.tenantId },
		select: { hostName: true, maxHostGuests: true },
	});
	if (!event?.hostName || event.maxHostGuests == null) {
		return 'Este evento no tiene un anfitrión con invitados configurado.';
	}

	const existingHostGuests = await prisma.saleTicket.count({
		where: { eventId: params.eventId, tenantId: params.tenantId, isHostGuest: true },
	});
	if (existingHostGuests + 1 > event.maxHostGuests) {
		return `El anfitrión ${event.hostName} ya alcanzó su máximo de ${event.maxHostGuests} invitados para este evento.`;
	}
	return null;
}
