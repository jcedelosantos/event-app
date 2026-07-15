import { prisma } from './prisma';

// Solo los tenants tipo CLUB piden esta info al reservar un asiento — el resto de las
// organizaciones (iglesias, general) no la necesitan. Ver Tenant.type en schema.prisma.
export const MAX_INVITADOS_PER_SOCIO = 2;

export type AttendeeType = 'SOCIO' | 'INVITADO';

export async function isClubTenant(tenantId: number): Promise<boolean> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
	return tenant?.type === 'CLUB';
}

// Devuelve un mensaje de error si la reserva no cumple la regla de socio/invitado, o null si está
// OK. Un socio necesita su propio carnet; un invitado necesita el carnet del socio que lo invita, y
// ese socio no puede acumular más de MAX_INVITADOS_PER_SOCIO invitados en el mismo evento.
export async function validateAttendeeRule(params: {
	tenantId: number;
	eventId: number;
	attendeeType: AttendeeType | undefined;
	sponsorCarnet: string | undefined;
	clientCarnet: string | undefined;
	// Cuántos invitados nuevos consumiría ESTA operación (una compra pública puede reservar varios
	// asientos de una — todos bajo el mismo socio — en una sola llamada). Default 1 para el flujo
	// manual del manager, que siempre crea una venta a la vez.
	newInviteCount?: number;
}): Promise<string | null> {
	if (!params.attendeeType) {
		return 'Elegí si la reserva es de un socio o de un invitado.';
	}

	if (params.attendeeType === 'SOCIO') {
		if (!params.clientCarnet?.trim()) {
			return 'El socio debe tener un carnet registrado.';
		}
		return null;
	}

	const sponsorCarnet = params.sponsorCarnet?.trim();
	if (!sponsorCarnet) {
		return 'Ingresá el carnet del socio que invita.';
	}

	// Un invitado no puede "entrar solo" al evento — el socio que lo invita tiene que tener su
	// propia entrada ya comprada para este mismo evento (identificado por carnet, no por sesión, ya
	// que el invitado hace su propia compra por separado).
	const sponsorRegistered = await prisma.saleTicket.findFirst({
		where: { eventId: params.eventId, tenantId: params.tenantId, attendeeType: 'SOCIO', client: { carnet: sponsorCarnet } },
	});
	if (!sponsorRegistered) {
		return `Socio ${sponsorCarnet} aún no está registrado en este evento.`;
	}

	const existingInvites = await prisma.saleTicket.count({
		where: { eventId: params.eventId, tenantId: params.tenantId, attendeeType: 'INVITADO', sponsorCarnet },
	});
	const newInviteCount = params.newInviteCount ?? 1;
	if (existingInvites + newInviteCount > MAX_INVITADOS_PER_SOCIO) {
		return `Este socio ya alcanzó el máximo de ${MAX_INVITADOS_PER_SOCIO} invitados para este evento.`;
	}
	return null;
}
