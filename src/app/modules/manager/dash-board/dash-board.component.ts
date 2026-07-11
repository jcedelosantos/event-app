import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { EventsService } from '../events/services/events.service';
import { QRService, SaleTicket } from '../qrs/services/qr.service';
import { ProductSalesService, SaleProduct } from '../qrs/services/product-sales.service';
import { UserService } from '../users/services/user.service';
import { Events } from '../../../models/events/events';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { MiniBarChartComponent, BarChartItem } from '../../../shared/mini-bar-chart/mini-bar-chart.component';

@Component({
	selector: 'app-dash-board',
	imports: [RouterLink, MiniBarChartComponent],
	template: `
		<h2 class="pb-3">Dashboard</h2>

		<div class="row g-3 mb-4">
			<div class="col-md-3 col-sm-6">
				<div class="card stat-card">
					<div class="card-body">
						<div class="stat-label">Eventos próximos</div>
						<div class="stat-value">{{ upcomingEvents().length }}</div>
					</div>
				</div>
			</div>
			<div class="col-md-3 col-sm-6">
				<div class="card stat-card">
					<div class="card-body">
						<div class="stat-label">Tickets vendidos</div>
						<div class="stat-value">{{ saleTickets().length }}</div>
					</div>
				</div>
			</div>
			<div class="col-md-3 col-sm-6">
				<div class="card stat-card">
					<div class="card-body">
						<div class="stat-label">Ingresos totales</div>
						<div class="stat-value">{{ totalRevenue() }} USD</div>
					</div>
				</div>
			</div>
			<div class="col-md-3 col-sm-6">
				<div class="card stat-card">
					<div class="card-body">
						<div class="stat-label">Ventas de productos</div>
						<div class="stat-value">{{ saleProducts().length }}</div>
					</div>
				</div>
			</div>
			<div class="col-md-3 col-sm-6">
				<div class="card stat-card">
					<div class="card-body">
						<div class="stat-label">Usuarios registrados</div>
						<div class="stat-value">{{ users().length }}</div>
					</div>
				</div>
			</div>
		</div>

		<div class="row g-3">
			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header d-flex justify-content-between align-items-center">
						<span>Próximos eventos</span>
						<a routerLink="/manager/events" class="btn btn-sm btn-outline-danger">Ver todos</a>
					</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else if (!upcomingEvents().length) {
							<p class="text-body-secondary">No hay eventos próximos.</p>
						} @else {
							<ul class="list-group list-group-flush">
								@for (event of upcomingEvents().slice(0, 5); track event.id) {
									<li class="list-group-item d-flex justify-content-between align-items-center">
										<span>{{ event.name }}</span>
										<span class="badge text-bg-danger">{{ formatDate(event.dateOn) }}</span>
									</li>
								}
							</ul>
						}
					</div>
				</div>
			</div>

			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header d-flex justify-content-between align-items-center">
						<span>Ventas recientes</span>
						<a routerLink="/manager/qrs" class="btn btn-sm btn-outline-danger">Ver todas</a>
					</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else if (!recentSales().length) {
							<p class="text-body-secondary">Todavía no se ha vendido ningún ticket.</p>
						} @else {
							<ul class="list-group list-group-flush">
								@for (sale of recentSales(); track sale.id) {
									<li class="list-group-item d-flex justify-content-between align-items-center">
										<span>{{ sale.event.name }} — {{ sale.client.name }} {{ sale.client.lastname }}</span>
										<span class="badge text-bg-secondary">{{ sale.ticket.price }} USD</span>
									</li>
								}
							</ul>
						}
					</div>
				</div>
			</div>
		</div>

		<div class="row g-3 mt-1">
			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header">Ingresos por evento</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else {
							<mini-bar-chart [data]="revenueByEvent()" suffix=" USD" />
						}
					</div>
				</div>
			</div>
			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header">Ventas por forma de pago</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else {
							<mini-bar-chart [data]="salesByPaidType()" />
						}
					</div>
				</div>
			</div>
		</div>

		<div class="row g-3 mt-1">
			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header">Ingresos por producto</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else {
							<mini-bar-chart [data]="revenueByProduct()" suffix=" USD" />
						}
					</div>
				</div>
			</div>
			<div class="col-lg-6">
				<div class="card h-100">
					<div class="card-header">Unidades vendidas por producto</div>
					<div class="card-body">
						@if (loading()) {
							<p class="text-body-secondary">Cargando...</p>
						} @else {
							<mini-bar-chart [data]="unitsByProduct()" />
						}
					</div>
				</div>
			</div>
		</div>
	`,
	styleUrl: './dash-board.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashBoardComponent implements OnInit {
	private readonly eventsService = inject(EventsService);
	private readonly qrService = inject(QRService);
	private readonly productSalesService = inject(ProductSalesService);
	private readonly userService = inject(UserService);

	loading = signal(true);
	events = signal<Events[]>([]);
	saleTickets = signal<SaleTicket[]>([]);
	saleProducts = signal<SaleProduct[]>([]);
	users = signal<unknown[]>([]);

	upcomingEvents = computed(() => {
		const today = todayKey();
		return this.events()
			.filter((e) => eventDateKey(e.dateOn) >= today)
			.sort((a, b) => a.dateOn.getTime() - b.dateOn.getTime());
	});

	totalRevenue = computed(() => {
		const ticketRevenue = this.saleTickets().reduce((sum, sale) => sum + (sale.ticket?.price ?? 0), 0);
		const productRevenue = this.saleProducts().reduce((sum, sale) => sum + (sale.product?.price ?? 0) * sale.quantity, 0);
		return ticketRevenue + productRevenue;
	});

	recentSales = computed(() =>
		[...this.saleTickets()].sort((a, b) => new Date(b.dateSold).getTime() - new Date(a.dateSold).getTime()).slice(0, 5),
	);

	revenueByEvent = computed<BarChartItem[]>(() => {
		const totals = new Map<string, number>();
		for (const sale of this.saleTickets()) {
			const label = sale.event?.name ?? 'Sin evento';
			totals.set(label, (totals.get(label) ?? 0) + (sale.ticket?.price ?? 0));
		}
		return Array.from(totals, ([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6);
	});

	salesByPaidType = computed<BarChartItem[]>(() => {
		const totals = new Map<string, number>();
		for (const sale of this.saleTickets()) {
			const label = sale.paidType || 'Sin especificar';
			totals.set(label, (totals.get(label) ?? 0) + 1);
		}
		return Array.from(totals, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
	});

	revenueByProduct = computed<BarChartItem[]>(() => {
		const totals = new Map<string, number>();
		for (const sale of this.saleProducts()) {
			const label = sale.product?.name ?? 'Sin producto';
			totals.set(label, (totals.get(label) ?? 0) + (sale.product?.price ?? 0) * sale.quantity);
		}
		return Array.from(totals, ([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6);
	});

	unitsByProduct = computed<BarChartItem[]>(() => {
		const totals = new Map<string, number>();
		for (const sale of this.saleProducts()) {
			const label = sale.product?.name ?? 'Sin producto';
			totals.set(label, (totals.get(label) ?? 0) + sale.quantity);
		}
		return Array.from(totals, ([label, value]) => ({ label, value }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 6);
	});

	ngOnInit(): void {
		forkJoin({
			events: this.eventsService.getEvents(),
			saleTickets: this.qrService.getQRs(),
			saleProducts: this.productSalesService.getSaleProducts(),
			users: this.userService.getUsers(),
		}).subscribe(({ events, saleTickets, saleProducts, users }) => {
			this.events.set(events);
			this.saleTickets.set(saleTickets);
			this.saleProducts.set(saleProducts);
			this.users.set(users);
			this.loading.set(false);
		});
	}

	formatDate(date: Date): string {
		return new Date(date).toISOString().split('T')[0];
	}
}
