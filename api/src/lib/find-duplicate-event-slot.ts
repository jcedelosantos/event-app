import { prisma } from './prisma';

// Solo tiene sentido cuando el evento tiene un mapa asignado — dos eventos "Sin asignar" no son
// necesariamente el mismo evento repetido por error. Cubre el caso real reportado: crear "eventos
// nuevos iguales" y terminar con la misma función cargada dos veces sin querer. Extraído de
// routes/events.ts para reusarlo también desde el webhook de WhatsApp (ver routes/public.ts).
export async function findDuplicateEventSlot(tenantId: number, mapId: number | null | undefined, dateOn: Date, excludeId?: number) {
	if (!mapId) return null;
	return prisma.event.findFirst({
		where: { tenantId, mapId, dateOn, ...(excludeId ? { id: { not: excludeId } } : {}) },
		select: { name: true },
	});
}
