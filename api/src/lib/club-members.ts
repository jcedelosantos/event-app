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
export async function lookupClubMember(tenantId: number, carnet: string): Promise<MemberLookupResult | null> {
	const member = await prisma.clubMember.findUnique({
		where: { tenantId_carnet: { tenantId, carnet: normalizeCarnet(carnet) } },
	});
	if (!member) return null;
	return { active: member.active, name: member.name, lastname: member.lastname, email: member.email, phone: member.phone };
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
	if (!member) return `No encontramos el carnet ${trimmed} en la base de socios del club.`;
	if (!member.active) return `El carnet ${trimmed} no está activo — contactá a la organización.`;
	return null;
}
