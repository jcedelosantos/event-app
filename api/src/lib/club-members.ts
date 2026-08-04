import { prisma } from './prisma';
import { normalizeCarnet } from './attendee';

export type MemberLookupResult = {
	active: boolean;
	name: string;
	lastname: string;
	email: string;
	phone: string;
};

// Único punto de integración con el sistema de membresía real del club — hoy resuelve contra
// ClubMember (tabla simulada, ver prisma/seed-club-members.ts), el día que el club entregue su
// API real esta es la única función que hay que reescribir (un fetch al endpoint de ellos en vez
// de esta query); ni el endpoint público (routes/public.ts) ni el frontend se enteran del cambio.
// Devuelve null si el carnet no existe — nunca se distingue de "inactivo" hacia afuera (ver
// public.ts), para no confirmarle a un desconocido si un carnet puntual es válido o no.
//
// Carnet dependiente (ej. "v3345-0" para cónyuge/hijo del socio titular "v3345", ver
// CARNET_PATTERN en public-event.component.ts): normalmente no tiene registro propio en la base de
// socios, comparte la membresía del titular. Si no se encuentra el carnet exacto y tiene sufijo
// "-N", se resuelve recursivamente el carnet titular (sin el sufijo) — SOLO para heredar el
// bloqueo: si el titular está inactivo, el dependiente también lo está. Si el titular está activo
// pero el dependiente no tiene registro propio, no hay nada para autocompletar/bloquear acá — se
// trata como carnet no encontrado, y esa persona completa sus datos a mano como cualquier socio.
export async function lookupClubMember(tenantId: number, carnet: string): Promise<MemberLookupResult | null> {
	const normalized = normalizeCarnet(carnet);
	const member = await prisma.clubMember.findUnique({
		where: { tenantId_carnet: { tenantId, carnet: normalized } },
	});
	if (member) return { active: member.active, name: member.name, lastname: member.lastname, email: member.email, phone: member.phone };

	const dashIndex = normalized.indexOf('-');
	if (dashIndex > 0) {
		const principal = await lookupClubMember(tenantId, normalized.slice(0, dashIndex));
		if (principal && !principal.active) {
			return { ...principal };
		}
	}
	return null;
}

// Fuente de verdad real para el picker público (no la venta manual del manager, ver abajo):
// devuelve un mensaje de error si el carnet de un SOCIO no existe o no está activo en el club, o
// null si puede comprar. Deliberadamente NO se llama desde sale-tickets.ts (venta manual/walk-in
// del manager) — el staff conoce al socio en persona y puede vender igual aunque todavía no esté
// cargado en esta simulación; el chequeo solo tiene sentido en el flujo self-service donde nadie
// más está verificando la identidad.
export async function assertActiveMember(tenantId: number, carnet: string | undefined): Promise<string | null> {
	const trimmed = carnet?.trim();
	if (!trimmed) return null;
	const member = await lookupClubMember(tenantId, trimmed);
	if (!member) return `No encontramos el carnet (${trimmed}) en la base de socios del club.`;
	if (!member.active) return `El socio con el carnet (${trimmed}) se encuentra inactivo — favor pasar por administración.`;
	return null;
}
