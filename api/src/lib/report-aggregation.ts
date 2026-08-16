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
			select: { checkedInAt: true, priceUSD: true, ticket: { select: { price: true } }, event: { select: { name: true } } },
		}),
		prisma.saleProduct.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo } },
			select: { quantity: true, unitPriceUSD: true, product: { select: { price: true, name: true } } },
		}),
	]);

	const revenueByEventMap = new Map<string, number>();
	let totalRevenue = 0;
	let totalCheckIns = 0;
	for (const sale of saleTickets) {
		// priceUSD null = venta de antes de este campo (ver comentario en schema.prisma) — cae de
		// vuelta al precio actual del ticket solo en esos casos.
		const price = sale.priceUSD ?? sale.ticket.price;
		totalRevenue += price;
		if (sale.checkedInAt) totalCheckIns += 1;
		revenueByEventMap.set(sale.event.name, (revenueByEventMap.get(sale.event.name) ?? 0) + price);
	}

	const revenueByProductMap = new Map<string, number>();
	let totalProductsSold = 0;
	for (const sale of saleProducts) {
		const unitPrice = sale.unitPriceUSD ?? sale.product.price;
		const revenue = unitPrice * sale.quantity;
		totalRevenue += revenue;
		totalProductsSold += sale.quantity;
		revenueByProductMap.set(sale.product.name, (revenueByProductMap.get(sale.product.name) ?? 0) + revenue);
	}

	const toSortedItems = (map: Map<string, number>) =>
		Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

	return {
		totalRevenue,
		totalTicketsSold: saleTickets.length,
		totalCheckIns,
		totalProductsSold,
		revenueByEvent: toSortedItems(revenueByEventMap),
		revenueByProduct: toSortedItems(revenueByProductMap),
	};
}
