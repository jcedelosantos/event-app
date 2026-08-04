// Estructural en vez de tipado contra PrismaClient/TransactionClient — mismo motivo que
// lib/unique-username.ts: el `tx` real que entra acá viene de un `prisma.$transaction(async (tx) =>
// ...)` sobre un cliente extendido (tenant-guard), cuyo tipo generado no encaja limpio con
// Prisma.TransactionClient, pero el único método que hace falta (saleTicket.count) sí calza.
type CapacityCheckClient = { saleTicket: { count: (args: { where: { eventId: number; tenantId: number } }) => Promise<number> } };

// Cupo total del evento (Event.maxCapacity), compartido entre TODOS los tipos de ticket — a
// diferencia de Ticket.count (stock por tipo), este tope no tiene un contador propio que mantener
// sincronizado: cuenta los SaleTicket ya creados en vivo, DENTRO de la misma transacción que va a
// crear los nuevos, así ve el estado real incluyendo lo que la propia operación ya insertó. SQLite
// serializa transacciones de escritura, así que este count-then-create es seguro contra el mismo
// tipo de carrera que ya protege el resto del flujo de compra (ver el updateMany condicional sobre
// Ticket.count en public.ts/sale-tickets.ts).
export async function assertEventCapacity(
	tx: CapacityCheckClient,
	params: { eventId: number; tenantId: number; maxCapacity: number | null; requestedSeats: number },
): Promise<string | null> {
	if (params.maxCapacity == null) return null;
	const sold = await tx.saleTicket.count({ where: { eventId: params.eventId, tenantId: params.tenantId } });
	if (sold + params.requestedSeats > params.maxCapacity) {
		return `Este evento alcanzó su aforo máximo de ${params.maxCapacity} personas.`;
	}
	return null;
}
