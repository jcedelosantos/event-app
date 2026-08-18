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
	// Sin sede asignada cae bajo el label "Sin sede" — para un tenant sin ninguna Location dada de
	// alta, todo termina ahí (un solo bucket), sin romper nada del lado del caller.
	revenueByLocation: Array<{ label: string; value: number }>;
};

const SIN_SEDE_LABEL = 'Sin sede';

// A diferencia del dashboard (que trae TODO el historial del tenant y agrega en el cliente,
// ver dash-board.component.ts), acá el rango ya viene acotado a un solo mes/trimestre cerrado
// (ver scheduled-reports.ts) — el volumen por período es chico incluso para un tenant con años
// de historial, así que alcanza con un findMany + reduce en JS, sin necesitar groupBy/SQL crudo.
// locationId opcional: sin caller pasándolo hoy (el correo periódico sigue siendo tenant-wide), solo
// acota el resultado a una sede cuando alguien lo necesite más adelante (ver routes/locations.ts).
export async function computeTenantReportStats(tenantId: number, dateFrom: Date, dateTo: Date, locationId?: number): Promise<TenantReportStats> {
	const locationFilter = locationId != null ? { event: { locationId } } : {};
	const [saleTickets, saleProducts] = await Promise.all([
		prisma.saleTicket.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo }, ...locationFilter },
			select: { checkedInAt: true, priceCents: true, ticket: { select: { priceCents: true } }, event: { select: { id: true, name: true, location: { select: { name: true } } } } },
		}),
		prisma.saleProduct.findMany({
			where: { tenantId, dateSold: { gte: dateFrom, lt: dateTo }, ...locationFilter },
			select: { quantity: true, unitPriceCents: true, product: { select: { id: true, priceCents: true, name: true } }, event: { select: { location: { select: { name: true } } } } },
		}),
	]);

	// Agrupado por id, no por nombre — dos eventos/productos con el mismo nombre (frecuente en
	// eventos recurrentes) antes se fusionaban silenciosamente en una sola fila del reporte.
	const revenueByEventMap = new Map<number, { label: string; value: number }>();
	const revenueByLocationMap = new Map<string, { label: string; value: number }>();
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

		const locationLabel = sale.event.location?.name ?? SIN_SEDE_LABEL;
		const locationEntry = revenueByLocationMap.get(locationLabel);
		if (locationEntry) locationEntry.value += priceCents;
		else revenueByLocationMap.set(locationLabel, { label: locationLabel, value: priceCents });
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

		const locationLabel = sale.event.location?.name ?? SIN_SEDE_LABEL;
		const locationEntry = revenueByLocationMap.get(locationLabel);
		if (locationEntry) locationEntry.value += revenueCents;
		else revenueByLocationMap.set(locationLabel, { label: locationLabel, value: revenueCents });
	}

	const toSortedItems = <K>(map: Map<K, { label: string; value: number }>) =>
		Array.from(map.values()).sort((a, b) => b.value - a.value);

	return {
		totalRevenueCents,
		totalTicketsSold: saleTickets.length,
		totalCheckIns,
		totalProductsSold,
		revenueByEvent: toSortedItems(revenueByEventMap),
		revenueByProduct: toSortedItems(revenueByProductMap),
		revenueByLocation: toSortedItems(revenueByLocationMap),
	};
}
