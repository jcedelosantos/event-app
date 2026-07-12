import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Events } from '../../../models/events/events';
import { Product } from '../../../models/products/product';
import { EventsService } from '../events/services/events.service';
import { QRService, SaleTicket } from '../qrs/services/qr.service';
import { ProductSalesService, SaleProduct } from '../qrs/services/product-sales.service';
import { ProductsService } from '../products/services/products.service';

type TicketRow = { name: string; sold: number; revenue: number };
type ProductRow = { name: string; sold: number; revenue: number; stock: number };

@Component({
	selector: 'app-reports',
	imports: [FormsModule],
	template: `
		<h2 class="section-title">Reportería</h2>

		<div class="row my-3">
			<div class="col-sm-5">
				<label class="form-label small text-body-secondary mb-1">Evento</label>
				<select class="form-select form-select-sm" [ngModel]="selectedEventId()" (ngModelChange)="onEventChange($event)">
					<option [ngValue]="null">Elegí un evento...</option>
					@for (event of events(); track event.id) {
						<option [ngValue]="event.id">{{ event.name }}</option>
					}
				</select>
			</div>
		</div>

		@if (!selectedEventId()) {
			<p class="text-body-secondary">Elegí un evento para ver su reporte de ventas.</p>
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
							<div class="stat-value">{{ ticketRevenue() }} USD</div>
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
							<div class="stat-value">{{ productRevenue() }} USD</div>
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

	events = signal<Events[]>([]);
	selectedEventId = signal<number | null>(null);
	loading = signal(false);

	saleTickets = signal<SaleTicket[]>([]);
	saleProducts = signal<SaleProduct[]>([]);
	products = signal<Product[]>([]);

	ticketRevenue = computed(() => this.saleTickets().reduce((sum, s) => sum + (s.ticket?.price ?? 0), 0));
	checkedInCount = computed(() => this.saleTickets().filter((s) => s.checkedInAt).length);
	checkedInPct = computed(() => {
		const total = this.saleTickets().length;
		return total > 0 ? Math.round((this.checkedInCount() / total) * 100) : 0;
	});
	productRevenue = computed(() => this.saleProducts().reduce((sum, s) => sum + (s.product?.price ?? 0) * s.quantity, 0));

	ticketRows = computed<TicketRow[]>(() => {
		const rows = new Map<string, TicketRow>();
		for (const sale of this.saleTickets()) {
			const name = sale.ticket?.name ?? 'Sin ticket';
			const row = rows.get(name) ?? { name, sold: 0, revenue: 0 };
			row.sold += 1;
			row.revenue += sale.ticket?.price ?? 0;
			rows.set(name, row);
		}
		return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
	});

	productRows = computed<ProductRow[]>(() => {
		const rows = new Map<string, ProductRow>();
		for (const sale of this.saleProducts()) {
			const name = sale.product?.name ?? 'Sin producto';
			const row = rows.get(name) ?? { name, sold: 0, revenue: 0, stock: 0 };
			row.sold += sale.quantity;
			row.revenue += (sale.product?.price ?? 0) * sale.quantity;
			rows.set(name, row);
		}
		for (const product of this.products()) {
			const row = rows.get(product.name);
			if (row) row.stock = product.count;
		}
		return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue);
	});

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
	}

	onEventChange(eventId: number | null) {
		this.selectedEventId.set(eventId);
		this.saleTickets.set([]);
		this.saleProducts.set([]);
		this.products.set([]);
		if (!eventId) return;

		this.loading.set(true);
		let pending = 3;
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
