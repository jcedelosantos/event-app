import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Events } from '../../../models/events/events';
import { Product } from '../../../models/products/product';
import { EventTransaction } from '../../../models/event-transactions/event-transaction';
import { EventsService } from '../events/services/events.service';
import { QRService, SaleTicket } from '../qrs/services/qr.service';
import { ProductSalesService, SaleProduct } from '../qrs/services/product-sales.service';
import { ProductsService } from '../products/services/products.service';
import { EventTransactionsService } from '../event-transactions/services/event-transactions.service';
import { centsToDollars } from '../../../shared/money';
import { Location } from '../../../models/locations/location';
import { LocationsService } from '../locations/services/locations.service';

type TicketRow = { name: string; sold: number; revenue: number };
type ProductRow = { name: string; sold: number; revenue: number; stock: number };
type TransactionRow = { category: string; type: 'INCOME' | 'EXPENSE'; count: number; total: number };

@Component({
	selector: 'app-reports',
	imports: [FormsModule],
	template: `
		<h2 class="section-title">Reportería</h2>

		<div class="row my-3 g-2">
			@if (locations().length) {
				<div class="col-sm-3">
					<label class="form-label small text-body-secondary mb-1">Sede</label>
					<select class="form-select form-select-sm" [ngModel]="selectedLocationId()" (ngModelChange)="selectedLocationId.set($event)">
						<option [ngValue]="null">Todas</option>
						@for (location of locations(); track location.id) {
							<option [ngValue]="location.id">{{ location.name }}</option>
						}
					</select>
				</div>
			}
			<div class="col-sm-5">
				<label class="form-label small text-body-secondary mb-1">Evento</label>
				<select class="form-select form-select-sm" [ngModel]="selectedEventId()" (ngModelChange)="onEventChange($event)">
					<option [ngValue]="null">Elige un evento...</option>
					@for (event of visibleEvents(); track event.id) {
						<option [ngValue]="event.id">{{ event.name }}</option>
					}
				</select>
			</div>
		</div>

		@if (!selectedEventId()) {
			<p class="text-body-secondary">Elige un evento para ver su reporte de ventas.</p>
		} @else if (loading()) {
			<p class="text-body-secondary">Cargando...</p>
		} @else {
			<div class="row g-3 mb-4">
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Tickets vendidos</div>
							<div class="stat-value">{{ saleTickets().length }}</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Ingresos por tickets</div>
							<div class="stat-value">{{ centsToDollars(ticketRevenue()) }} USD</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Check-in</div>
							<div class="stat-value">{{ checkedInCount() }} / {{ saleTickets().length }} ({{ checkedInPct() }}%)</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Ingresos por productos</div>
							<div class="stat-value">{{ centsToDollars(productRevenue()) }} USD</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Otros ingresos</div>
							<div class="stat-value">{{ centsToDollars(extraIncomeCents()) }} USD</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Gastos</div>
							<div class="stat-value">{{ centsToDollars(expenseCents()) }} USD</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6">
					<div class="card report-stat">
						<div class="card-body">
							<div class="stat-label">Margen</div>
							<div class="stat-value" [class.text-danger]="marginCents() < 0">{{ centsToDollars(marginCents()) }} USD</div>
						</div>
					</div>
				</div>
			</div>

			<div class="row g-3 mb-4">
				<div class="col-12">
					<div class="card h-100">
						<div class="card-header d-flex justify-content-between align-items-center">
							<span>Gastos e ingresos por categoría</span>
							<button type="button" class="btn btn-outline-danger btn-sm" [disabled]="!transactionRows().length" (click)="exportTransactionsCsv()">
								<i class="bi bi-download" aria-hidden="true"></i> CSV
							</button>
						</div>
						<div class="card-body p-0">
							<table class="table table-sm table-striped mb-0 report-table">
								<thead>
									<tr>
										<th>Categoría</th>
										<th>Tipo</th>
										<th class="text-end">Líneas</th>
										<th class="text-end">Total</th>
									</tr>
								</thead>
								<tbody>
									@for (row of transactionRows(); track row.category + row.type) {
										<tr>
											<td>{{ row.category }}</td>
											<td>
												<span class="badge" [class.text-bg-success]="row.type === 'INCOME'" [class.text-bg-danger]="row.type === 'EXPENSE'">
													{{ row.type === 'INCOME' ? 'Ingreso' : 'Gasto' }}
												</span>
											</td>
											<td class="text-end">{{ row.count }}</td>
											<td class="text-end">{{ row.total }} USD</td>
										</tr>
									} @empty {
										<tr>
											<td colspan="4" class="text-muted">Todavía no hay gastos ni ingresos cargados para este evento.</td>
										</tr>
									}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>

			<div class="row g-3">
				<div class="col-lg-6">
					<div class="card h-100">
						<div class="card-header d-flex justify-content-between align-items-center">
							<span>Ventas por tipo de ticket</span>
							<button type="button" class="btn btn-outline-danger btn-sm" [disabled]="!ticketRows().length" (click)="exportTicketsCsv()">
								<i class="bi bi-download" aria-hidden="true"></i> CSV
							</button>
						</div>
						<div class="card-body p-0">
							<table class="table table-sm table-striped mb-0 report-table">
								<thead>
									<tr>
										<th>Ticket</th>
										<th class="text-end">Vendidos</th>
										<th class="text-end">Ingresos</th>
									</tr>
								</thead>
								<tbody>
									@for (row of ticketRows(); track row.name) {
										<tr>
											<td>{{ row.name }}</td>
											<td class="text-end">{{ row.sold }}</td>
											<td class="text-end">{{ row.revenue }} USD</td>
										</tr>
									} @empty {
										<tr>
											<td colspan="3" class="text-muted">Todavía no hay ventas de tickets para este evento.</td>
										</tr>
									}
								</tbody>
							</table>
						</div>
					</div>
				</div>

				<div class="col-lg-6">
					<div class="card h-100">
						<div class="card-header d-flex justify-content-between align-items-center">
							<span>Ventas por producto</span>
							<button type="button" class="btn btn-outline-danger btn-sm" [disabled]="!productRows().length" (click)="exportProductsCsv()">
								<i class="bi bi-download" aria-hidden="true"></i> CSV
							</button>
						</div>
						<div class="card-body p-0">
							<table class="table table-sm table-striped mb-0 report-table">
								<thead>
									<tr>
										<th>Producto</th>
										<th class="text-end">Vendidos</th>
										<th class="text-end">Ingresos</th>
										<th class="text-end">Stock actual</th>
									</tr>
								</thead>
								<tbody>
									@for (row of productRows(); track row.name) {
										<tr>
											<td>{{ row.name }}</td>
											<td class="text-end">{{ row.sold }}</td>
											<td class="text-end">{{ row.revenue }} USD</td>
											<td class="text-end" [class.text-danger]="row.stock <= 0">{{ row.stock }}</td>
										</tr>
									} @empty {
										<tr>
											<td colspan="4" class="text-muted">Todavía no hay ventas de productos para este evento.</td>
										</tr>
									}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			</div>
		}
	`,
	styleUrl: './reports.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent implements OnInit {
	private readonly eventsService = inject(EventsService);
	private readonly qrService = inject(QRService);
	private readonly productSalesService = inject(ProductSalesService);
	private readonly productsService = inject(ProductsService);
	private readonly eventTransactionsService = inject(EventTransactionsService);
	private readonly locationsService = inject(LocationsService);
	readonly centsToDollars = centsToDollars;

	events = signal<Events[]>([]);
	selectedEventId = signal<number | null>(null);
	// Vacío para cualquier tenant que nunca dio de alta una sede — el selector se auto-oculta y
	// visibleEvents() no filtra nada en ese caso.
	locations = signal<Location[]>([]);
	selectedLocationId = signal<number | null>(null);
	visibleEvents = computed(() => {
		const locationId = this.selectedLocationId();
		return locationId == null ? this.events() : this.events().filter((e) => e.locationId === locationId);
	});
	loading = signal(false);

	saleTickets = signal<SaleTicket[]>([]);
	saleProducts = signal<SaleProduct[]>([]);
	products = signal<Product[]>([]);
	transactions = signal<EventTransaction[]>([]);

	// Centavos enteros (ver shared/money.ts) — se convierten a dólares recién al mostrarse.
	ticketRevenue = computed(() => this.saleTickets().reduce((sum, s) => sum + (s.priceCents ?? s.ticket?.priceCents ?? 0), 0));
	checkedInCount = computed(() => this.saleTickets().filter((s) => s.checkedInAt).length);
	checkedInPct = computed(() => {
		const total = this.saleTickets().length;
		return total > 0 ? Math.round((this.checkedInCount() / total) * 100) : 0;
	});
	productRevenue = computed(() => this.saleProducts().reduce((sum, s) => sum + (s.unitPriceCents ?? s.product?.priceCents ?? 0) * s.quantity, 0));
	extraIncomeCents = computed(() => this.transactions().filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountCents, 0));
	expenseCents = computed(() => this.transactions().filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountCents, 0));
	marginCents = computed(() => this.ticketRevenue() + this.productRevenue() + this.extraIncomeCents() - this.expenseCents());

	// row.revenue se acumula en centavos y se convierte a dólares recién al final, para no arrastrar
	// error de redondeo float sumando venta por venta.
	ticketRows = computed<TicketRow[]>(() => {
		const rows = new Map<string, TicketRow>();
		for (const sale of this.saleTickets()) {
			const name = sale.ticket?.name ?? 'Sin ticket';
			const row = rows.get(name) ?? { name, sold: 0, revenue: 0 };
			row.sold += 1;
			row.revenue += sale.priceCents ?? sale.ticket?.priceCents ?? 0;
			rows.set(name, row);
		}
		return Array.from(rows.values())
			.map((row) => ({ ...row, revenue: centsToDollars(row.revenue) }))
			.sort((a, b) => b.revenue - a.revenue);
	});

	productRows = computed<ProductRow[]>(() => {
		const rows = new Map<string, ProductRow>();
		for (const sale of this.saleProducts()) {
			const name = sale.product?.name ?? 'Sin producto';
			const row = rows.get(name) ?? { name, sold: 0, revenue: 0, stock: 0 };
			row.sold += sale.quantity;
			row.revenue += (sale.unitPriceCents ?? sale.product?.priceCents ?? 0) * sale.quantity;
			rows.set(name, row);
		}
		for (const product of this.products()) {
			const row = rows.get(product.name);
			if (row) row.stock = product.count;
		}
		return Array.from(rows.values())
			.map((row) => ({ ...row, revenue: centsToDollars(row.revenue) }))
			.sort((a, b) => b.revenue - a.revenue);
	});

	// Agrupado por categoría + tipo (una fila "Renta de espacio / Gasto" no se mezcla con una
	// eventual "Renta de espacio / Ingreso") — mismo criterio de acumular en centavos que
	// ticketRows/productRows, para no arrastrar redondeo float línea por línea.
	transactionRows = computed<TransactionRow[]>(() => {
		const rows = new Map<string, TransactionRow>();
		for (const t of this.transactions()) {
			const key = `${t.category}__${t.type}`;
			const row = rows.get(key) ?? { category: t.category, type: t.type, count: 0, total: 0 };
			row.count += 1;
			row.total += t.amountCents;
			rows.set(key, row);
		}
		return Array.from(rows.values())
			.map((row) => ({ ...row, total: centsToDollars(row.total) }))
			.sort((a, b) => b.total - a.total);
	});

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
		this.locationsService.getLocations().subscribe((locations) => this.locations.set(locations));
	}

	onEventChange(eventId: number | null) {
		this.selectedEventId.set(eventId);
		this.saleTickets.set([]);
		this.saleProducts.set([]);
		this.products.set([]);
		this.transactions.set([]);
		if (!eventId) return;

		this.loading.set(true);
		let pending = 4;
		const done = () => {
			pending -= 1;
			if (pending === 0) this.loading.set(false);
		};
		this.qrService.getQRsByEvent(eventId).subscribe((sales) => {
			this.saleTickets.set(sales);
			done();
		});
		this.productSalesService.getSaleProductsByEvent(eventId).subscribe((sales) => {
			this.saleProducts.set(sales);
			done();
		});
		this.productsService.getProductsByEvent(eventId).subscribe((products) => {
			this.products.set(products);
			done();
		});
		this.eventTransactionsService.getByEvent(eventId).subscribe((transactions) => {
			this.transactions.set(transactions);
			done();
		});
	}

	exportTicketsCsv() {
		this.downloadCsv(
			['Ticket', 'Vendidos', 'Ingresos'],
			this.ticketRows().map((r) => [r.name, r.sold, r.revenue]),
			'reporte-tickets',
		);
	}

	exportProductsCsv() {
		this.downloadCsv(
			['Producto', 'Vendidos', 'Ingresos', 'Stock actual'],
			this.productRows().map((r) => [r.name, r.sold, r.revenue, r.stock]),
			'reporte-productos',
		);
	}

	exportTransactionsCsv() {
		this.downloadCsv(
			['Categoría', 'Tipo', 'Líneas', 'Total'],
			this.transactionRows().map((r) => [r.category, r.type === 'INCOME' ? 'Ingreso' : 'Gasto', r.count, r.total]),
			'reporte-gastos-ingresos',
		);
	}

	private downloadCsv(header: string[], rows: (string | number)[][], filename: string) {
		const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
		const csv = [header.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const eventName = this.events().find((e) => e.id === this.selectedEventId())?.name ?? 'evento';
		const a = document.createElement('a');
		a.href = url;
		a.download = `${filename}-${eventName}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
}
