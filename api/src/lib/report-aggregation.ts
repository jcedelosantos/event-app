import { prisma } from './prisma';

export type TenantReportStats = {
	totalRevenue: number;
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
			select: { checkedInAt: true, priceUSD: true, ticket: { select: { price: true } }, event: { select: { id: true, name: true } } },
		}),
		prisma.saleProduct.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo } },
			select: { quantity: true, unitPriceUSD: true, product: { select: { id: true, price: true, name: true } } },
		}),
	]);

	// Agrupado por id, no por nombre — dos eventos/productos con el mismo nombre (frecuente en
	// eventos recurrentes) antes se fusionaban silenciosamente en una sola fila del reporte.
	const revenueByEventMap = new Map<number, { label: string; value: number }>();
	let totalRevenue = 0;
	let totalCheckIns = 0;
	for (const sale of saleTickets) {
		// priceUSD null = venta de antes de este campo (ver comentario en schema.prisma) — cae de
		// vuelta al precio actual del ticket solo en esos casos.
		const price = sale.priceUSD ?? sale.ticket.price;
		totalRevenue += price;
		if (sale.checkedInAt) totalCheckIns += 1;
		const entry = revenueByEventMap.get(sale.event.id);
		if (entry) entry.value += price;
		else revenueByEventMap.set(sale.event.id, { label: sale.event.name, value: price });
	}

	const revenueByProductMap = new Map<number, { label: string; value: number }>();
	let totalProductsSold = 0;
	for (const sale of saleProducts) {
		const unitPrice = sale.unitPriceUSD ?? sale.product.price;
		const revenue = unitPrice * sale.quantity;
		totalRevenue += revenue;
		totalProductsSold += sale.quantity;
		const entry = revenueByProductMap.get(sale.product.id);
		if (entry) entry.value += revenue;
		else revenueByProductMap.set(sale.product.id, { label: sale.product.name, value: revenue });
	}

	const toSortedItems = (map: Map<number, { label: string; value: number }>) =>
		Array.from(map.values()).sort((a, b) => b.value - a.value);

	return {
		totalRevenue,
		totalTicketsSold: saleTickets.length,
		totalCheckIns,
		totalProductsSold,
		revenueByEvent: toSortedItems(revenueByEventMap),
		revenueByProduct: toSortedItems(revenueByProductMap),
	};
}
