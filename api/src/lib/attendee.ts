import { prisma } from './prisma';

// Solo los tenants tipo CLUB piden esta info al reservar un asiento — el resto de las
// organizaciones (iglesias, general) no la necesitan. Ver Tenant.type en schema.prisma.
export const MAX_INVITADOS_PER_SOCIO = 2;

export type AttendeeType = 'SOCIO' | 'INVITADO';

export async function isClubTenant(tenantId: number): Promise<boolean> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { type: true } });
	return tenant?.type === 'CLUB';
}

// Los carnets se tipean a mano (el socio en un lado, el invitado del otro) — sin normalizar,
// "C6735" y "c6735" cuentan como socios distintos y un socio real termina apareciendo como "no
// registrado". SQLite compara TEXT de forma case-sensitive por default, así que esto se resuelve
// en JS, no con `equals` de Prisma.
export function normalizeCarnet(carnet: string): string {
	return carnet.trim().toLowerCase();
}

// "v3345-0" y "v3345" comparten la misma membresía (carnet dependiente de cónyuge/hijo, ver
// CARNET_PATTERN en public-event.component.ts) — para el tope de invitados tienen que contar como
// el MISMO socio, así nadie esquiva el tope repartiendo invitados entre el carnet titular y sus
// dependientes.
export function principalCarnet(carnet: string): string {
	return normalizeCarnet(carnet).split('-')[0];
}

// Estructural en vez de tipado contra PrismaClient/TransactionClient — mismo motivo que
// lib/unique-username.ts: cuando esta regla se valida DENTRO de una transacción en progreso (ver
// public.ts, invitados cargados por el propio socio), necesita ver filas recién creadas en esa
// misma tx, no solo lo ya confirmado en la DB.
type AttendeeCheckClient = { saleTicket: { findMany: (args: any) => Promise<{ client?: { carnet: string | null }; sponsorCarnet?: string | null }[]> } };

// Devuelve un mensaje de error si la reserva no cumple la regla de socio/invitado, o null si está
// OK. Un socio necesita su propio carnet; un invitado necesita el carnet del socio que lo invita, y
// ese socio no puede acumular más de MAX_INVITADOS_PER_SOCIO (o el override del evento) invitados
// en el mismo evento.
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
	// Tope de invitados configurado en Event.maxGuestsPerSponsor — null/undefined = usa
	// MAX_INVITADOS_PER_SOCIO (comportamiento de siempre, eventos sin este campo configurado).
	maxGuestsOverride?: number | null;
	// Cliente de DB a usar para las queries — default el global `prisma`; pasar el `tx` de una
	// transacción en progreso cuando el socio que invita se acaba de crear en esa misma transacción.
	db?: AttendeeCheckClient;
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
	const normalizedSponsor = principalCarnet(sponsorCarnet);
	// Anotado explícito (no inferido de `??`) — sin esto, TS unifica el tipo estructural angosto con
	// el tipo real (y mucho más ancho) de `prisma`, y el `select` de las queries de abajo deja de
	// angostar el resultado.
	const db: AttendeeCheckClient = params.db ?? prisma;

	// Un invitado no puede "entrar solo" al evento — el socio que lo invita tiene que tener su
	// propia entrada ya comprada para este mismo evento (identificado por carnet, no por sesión, ya
	// que el invitado hace su propia compra por separado — o, si viene de la misma compra del socio,
	// su entrada ya se creó unas líneas antes en la misma transacción).
	const socioSales = await db.saleTicket.findMany({
		where: { eventId: params.eventId, tenantId: params.tenantId, attendeeType: 'SOCIO' },
		select: { client: { select: { carnet: true } } },
	});
	const sponsorRegistered = socioSales.some((s) => principalCarnet(s.client?.carnet ?? '') === normalizedSponsor);
	if (!sponsorRegistered) {
		return `Socio ${sponsorCarnet} aún no está registrado en este evento.`;
	}

	const invitadoSales = await db.saleTicket.findMany({
		where: { eventId: params.eventId, tenantId: params.tenantId, attendeeType: 'INVITADO' },
		select: { sponsorCarnet: true },
	});
	const existingInvites = invitadoSales.filter((s) => principalCarnet(s.sponsorCarnet ?? '') === normalizedSponsor).length;
	const newInviteCount = params.newInviteCount ?? 1;
	const maxGuests = params.maxGuestsOverride ?? MAX_INVITADOS_PER_SOCIO;
	if (existingInvites + newInviteCount > maxGuests) {
		return `Este socio ya alcanzó el máximo de ${maxGuests} invitados para este evento.`;
	}
	return null;
}
