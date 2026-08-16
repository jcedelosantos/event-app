import { prisma } from './prisma';

// value acá está en centavos enteros (ver lib/money.ts), no dólares — mismo campo que
// revenueByEvent/revenueByProduct.
export type TenantReportStats = {
	totalRevenueCents: number;
	totalTicketsSold: number;
	totalCheckIns: number;
	totalProductsSold: number;
	revenueByEvent: Array<{ label: string; value: number }>;
	revenueByProduct: Array<{ label: string; value: number }>;
};

// A diferencia del dashboard (que trae TODO el historial del tenant y agrega en el cliente,
// ver dash-board.component.ts), acá el rango ya viene acotado a un solo mes/trimestre cerrado
// (ver scheduled-reports.ts) — el volumen por período es chico incluso para un tenant con años
// de historial, así que alcanza con un findMany + reduce en JS, sin necesitar groupBy/SQL crudo.
export async function computeTenantReportStats(tenantId: number, dateFrom: Date, dateTo: Date): Promise<TenantReportStats> {
	const [saleTickets, saleProducts] = await Promise.all([
		prisma.saleTicket.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo } },
			select: { checkedInAt: true, priceCents: true, ticket: { select: { priceCents: true } }, event: { select: { id: true, name: true } } },
		}),
		prisma.saleProduct.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo } },
			select: { quantity: true, unitPriceCents: true, product: { select: { id: true, priceCents: true, name: true } } },
		}),
	]);

	// Agrupado por id, no por nombre — dos eventos/productos con el mismo nombre (frecuente en
	// eventos recurrentes) antes se fusionaban silenciosamente en una sola fila del reporte.
	const revenueByEventMap = new Map<number, { label: string; value: number }>();
	let totalRevenueCents = 0;
	let totalCheckIns = 0;
	for (const sale of saleTickets) {
		// priceCents null = venta de antes de este campo (ver comentario en schema.prisma) — cae de
		// vuelta al precio actual del ticket solo en esos casos.
		const priceCents = sale.priceCents ?? sale.ticket.priceCents;
		totalRevenueCents += priceCents;
		if (sale.checkedInAt) totalCheckIns += 1;
		const entry = revenueByEventMap.get(sale.event.id);
		if (entry) entry.value += priceCents;
		else revenueByEventMap.set(sale.event.id, { label: sale.event.name, value: priceCents });
	}

	const revenueByProductMap = new Map<number, { label: string; value: number }>();
	let totalProductsSold = 0;
	for (const sale of saleProducts) {
		const unitPriceCents = sale.unitPriceCents ?? sale.product.priceCents;
		const revenueCents = unitPriceCents * sale.quantity;
		totalRevenueCents += revenueCents;
		totalProductsSold += sale.quantity;
		const entry = revenueByProductMap.get(sale.product.id);
		if (entry) entry.value += revenueCents;
		else revenueByProductMap.set(sale.product.id, { label: sale.product.name, value: revenueCents });
	}

	const toSortedItems = (map: Map<number, { label: string; value: number }>) =>
		Array.from(map.values()).sort((a, b) => b.value - a.value);

	return {
		totalRevenueCents,
		totalTicketsSold: saleTickets.length,
		totalCheckIns,
		totalProductsSold,
		revenueByEvent: toSortedItems(revenueByEventMap),
		revenueByProduct: toSortedItems(revenueByProductMap),
	};
}
