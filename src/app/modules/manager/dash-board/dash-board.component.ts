import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, map } from 'rxjs';
import { EventsService } from '../events/services/events.service';
import { QRService, SaleTicket } from '../qrs/services/qr.service';
import { ProductSalesService, SaleProduct } from '../qrs/services/product-sales.service';
import { UserService } from '../users/services/user.service';
import { User } from '../../../models/users/user';
import { Events } from '../../../models/events/events';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { MiniBarChartComponent, BarChartItem } from '../../../shared/mini-bar-chart/mini-bar-chart.component';
import { AccessPointsService } from '../access-points/services/access-points.service';
import { AccessPointStatsResponse } from '../../../models/access-points/access-point';
import { FlashEventModalComponent } from './components/flash-event-modal/flash-event-modal.component';
import { AuthService } from '../../../core/services/auth.service';
import { centsToDollars } from '../../../shared/money';
import { EventTransaction } from '../../../models/event-transactions/event-transaction';
import { EventTransactionsService } from '../event-transactions/services/event-transactions.service';

// Una puerta "concentra" tráfico cuando se lleva más de este % de las entradas recientes del
// evento — el umbral de "recientes" mínimas (ver GATE_ALERT_MIN_RECENT) evita que 1 de 1 escaneos
// dispare la alerta apenas arranca un evento.
const GATE_ALERT_CONCENTRATION_PCT = 50;
const GATE_ALERT_MIN_RECENT = 5;

// Refresco periódico solo de ventas (no eventos/usuarios) mientras el Dashboard está abierto, para
// que la barra de "Eventos de hoy" refleje los check-ins que va haciendo el scanner en tiempo real
// sin que alguien tenga que recargar la página a mano.
const LIVE_REFRESH_MS = 20_000;

@Component({
	selector: 'app-dash-board',
	imports: [RouterLink, MiniBarChartComponent, FlashEventModalComponent],
	template: `
		<div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
			<h2 class="section-title mb-0">Panel</h2>
			<button type="button" class="btn btn-danger btn-sm" data-bs-toggle="modal" data-bs-target="#flashEventModal">
				<i class="bi bi-lightning-charge-fill"></i> Evento flash
			</button>
		</div>
		<app-flash-event-modal />
		<br />

		@if (showOnboarding()) {
			<div class="card mb-4 border-danger-subtle">
				<div class="card-body">
					<div class="d-flex justify-content-between align-items-start">
						<h5 class="mb-1">Primeros pasos</h5>
						<button type="button" class="btn-close" aria-label="Cerrar" (click)="dismissOnboarding()"></button>
					</div>
					<p class="text-body-secondary small mb-3">Tu cuenta está lista — completa esto para arrancar a vender entradas.</p>
					<div class="row g-2">
						<div class="col-md-3 col-sm-6">
							<a routerLink="/manager/events" class="btn btn-outline-light btn-sm w-100 text-start">
								<i class="bi bi-calendar-plus"></i> Creá tu primer evento
							</a>
						</div>
						<div class="col-md-3 col-sm-6">
							<a routerLink="/manager/maps" class="btn btn-outline-light btn-sm w-100 text-start">
								<i class="bi bi-map"></i> Arma un mapa de asientos
							</a>
						</div>
						<div class="col-md-3 col-sm-6">
							<a routerLink="/manager/qrs" class="btn btn-outline-light btn-sm w-100 text-start">
								<i class="bi bi-ticket-perforated"></i> Generá y vende tickets
							</a>
						</div>
						<div class="col-md-3 col-sm-6">
							<a routerLink="/manager/settings" class="btn btn-outline-light btn-sm w-100 text-start">
								<i class="bi bi-palette"></i> Personalizá tu marca
							</a>
						</div>
					</div>
				</div>
			</div>
		}

		<div class="card mb-4">
			<div class="card-header">
				<span>Eventos de hoy</span>
			</div>
			<div class="card-body">
				@if (loading()) {
					<p class="text-body-secondary mb-0">Cargando...</p>
				} @else if (!todayEventStats().length) {
					<p class="text-body-secondary mb-0">No hay eventos programados para hoy.</p>
				} @else {
					@for (stat of todayEventStats(); track stat.event.id) {
						<div class="mb-3">
							<div class="d-flex justify-content-between align-items-center mb-1">
								<span class="fw-semibold">{{ stat.event.name }}</span>
								<span class="small text-body-secondary">{{ stat.checkedIn }} / {{ stat.sold }} ingresaron</span>
							</div>
							<div class="progress" style="height: 10px;">
								<div class="progress-bar bg-danger" [style.width.%]="stat.occupancyPct"></div>
							</div>
							<div class="small text-body-secondary mt-1">
								Capacidad: {{ stat.capacity }} · Vendidos: {{ stat.sold }} · Disponibles: {{ stat.available }}
							</div>
						</div>
					}
				}
			</div>
		</div>

		@if (gatePanels().length) {
			<div class="card mb-4">
				<div class="card-header">
					<span>Puertas — tráfico en vivo</span>
				</div>
				<div class="card-body">
					@for (panel of gatePanels(); track panel.eventId) {
						<div class="mb-3">
							<div class="fw-semibold mb-2">{{ panel.eventName }} — {{ panel.eventTotal }} ingresados en total</div>
							@if (panel.alert) {
								<div class="alert alert-warning py-2 px-3 mb-2">⚠ {{ panel.alert }}</div>
							}
							@for (gate of panel.gates; track gate.id) {
								<div class="d-flex justify-content-between align-items-center mb-1">
									<span>{{ gate.name }} @if (!gate.active) {(inactiva)}</span>
									<span class="small text-body-secondary">{{ gate.checkedIn }} ingresados · {{ gate.perMinute }}/min</span>
								</div>
								<div class="progress mb-2" style="height: 8px;">
									<div class="progress-bar" [class.bg-danger]="gate.concentrated" [class.bg-secondary]="!gate.concentrated" [style.width.%]="gate.sharePct"></div>
								</div>
							}
						</div>
					}
				</div>
			</div>
		}

		<div class="row g-3 mb-4">
			<div class="col-md-3 col-sm-6">
				<a routerLink="/manager/events" class="card stat-card stat-card-link text-decoration-none">
					<div class="card-body d-flex align-items-center gap-3">
						<i class="bi bi-calendar-event stat-icon"></i>
						<div>
							<div class="stat-label">Eventos próximos</div>
							<div class="stat-value">{{ upcomingEvents().length }}</div>
						</div>
					</div>
				</a>
			</div>
			<div class="col-md-3 col-sm-6">
				<a routerLink="/manager/qrs" class="card stat-card stat-card-link text-decoration-none">
					<div class="card-body d-flex align-items-center gap-3">
						<i class="bi bi-ticket-perforated stat-icon"></i>
						<div>
							<div class="stat-label">Tickets vendidos</div>
							<div class="stat-value">{{ saleTickets().length }}</div>
						</div>
					</div>
				</a>
			</div>
			<div class="col-md-3 col-sm-6">
				<a routerLink="/manager/qrs" class="card stat-card stat-card-link text-decoration-none">
					<div class="card-body d-flex align-items-center gap-3">
						<i class="bi bi-cash-stack stat-icon"></i>
						<div>
							<div class="stat-label">Ingresos totales</div>
							<div class="stat-value">{{ centsToDollars(totalRevenue()) }} USD</div>
						</div>
					</div>
				</a>
			</div>
			<div class="col-md-3 col-sm-6">
				<a routerLink="/manager/qrs" class="card stat-card stat-card-link text-decoration-none">
					<div class="card-body d-flex align-items-center gap-3">
						<i class="bi bi-bag-check stat-icon"></i>
						<div>
							<div class="stat-label">Ventas de productos</div>
							<div class="stat-value">{{ saleProducts().length }}</div>
						</div>
					</div>
				</a>
			</div>
			<div class="col-md-3 col-sm-6">
				<a routerLink="/manager/users" class="card stat-card stat-card-link text-decoration-none">
					<div class="card-body d-flex align-items-center gap-3">
						<i class="bi bi-people stat-icon"></i>
						<div>
							<div class="stat-label">Clientes registrados</div>
							<div class="stat-value">{{ clients().length }}</div>
						</div>
					</div>
				</a>
			</div>
			@if (eventsWithFinances() > 0) {
				<div class="col-md-3 col-sm-6">
					<a routerLink="/manager/reports" class="card stat-card stat-card-link text-decoration-none">
						<div class="card-body d-flex align-items-center gap-3">
							<i class="bi bi-graph-down-arrow stat-icon"></i>
							<div>
								<div class="stat-label">Gasto promedio por evento</div>
								<div class="stat-value">{{ centsToDollars(avgExpensePerEvent()) }} USD</div>
							</div>
						</div>
					</a>
				</div>
				<div class="col-md-3 col-sm-6">
					<a routerLink="/manager/reports" class="card stat-card stat-card-link text-decoration-none">
						<div class="card-body d-flex align-items-center gap-3">
							<i class="bi bi-graph-up-arrow stat-icon"></i>
							<div>
								<div class="stat-label">Margen promedio por evento</div>
								<div class="stat-value" [class.text-success]="avgMarginPerEvent() >= 0" [class.text-danger]="avgMarginPerEvent() < 0">
									{{ centsToDollars(avgMarginPerEvent()) }} USD
								</div>
							</div>
						</div>
					</a>
				</div>
			}
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
										<span class="badge text-bg-secondary">{{ centsToDollars(sale.priceCents ?? sale.ticket.priceCents) }} USD</span>
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
			<div class="row g-3 mt-1">
				<div class="col-lg-6">
					<div class="card h-100">
						<div class="card-header">Tendencia mensual — Ingresos</div>
						<div class="card-body">
							@if (loading()) {
								<p class="text-body-secondary">Cargando...</p>
							} @else if (monthsWithSalesCount() < 2) {
								<p class="text-body-secondary mb-0">Todavía no hay suficiente historial para ver tendencia.</p>
							} @else {
								<mini-bar-chart [data]="monthlyRevenueTrend()" suffix=" USD" />
							}
						</div>
					</div>
				</div>
				<div class="col-lg-6">
					<div class="card h-100">
						<div class="card-header">Tendencia mensual — Tickets vendidos</div>
						<div class="card-body">
							@if (loading()) {
								<p class="text-body-secondary">Cargando...</p>
							} @else if (monthsWithSalesCount() < 2) {
								<p class="text-body-secondary mb-0">Todavía no hay suficiente historial para ver tendencia.</p>
							} @else {
								<mini-bar-chart [data]="monthlyTicketsTrend()" />
							}
						</div>
					</div>
				</div>
			</div>
	`,
	styleUrl: './dash-board.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashBoardComponent implements OnInit, OnDestroy {
	readonly centsToDollars = centsToDollars;
	private readonly eventsService = inject(EventsService);
	private readonly qrService = inject(QRService);
	private readonly productSalesService = inject(ProductSalesService);
	private readonly userService = inject(UserService);
	private readonly accessPointsService = inject(AccessPointsService);
	private readonly eventTransactionsService = inject(EventTransactionsService);
	private readonly authService = inject(AuthService);
	private refreshTimer: ReturnType<typeof setInterval> | null = null;

	loading = signal(true);
	events = signal<Events[]>([]);
	saleTickets = signal<SaleTicket[]>([]);
	saleProducts = signal<SaleProduct[]>([]);
	eventTransactions = signal<EventTransaction[]>([]);
	users = signal<User[]>([]);
	gateStatsByEvent = signal<Map<number, AccessPointStatsResponse>>(new Map());

	clients = computed(() => this.users().filter((u) => u.type?.type === 'CLIENT'));

	// Checklist de "primeros pasos" — vive en localStorage (no AppSetting) a propósito: es una
	// preferencia de UI liviana sin ningún valor de negocio, y así cualquier cuenta del tenant puede
	// cerrarlo sin necesitar permiso de Admin (PUT /settings/:key es Admin-only, ver settings.ts).
	onboardingDismissed = signal(false);
	showOnboarding = computed(() => !this.loading() && this.events().length === 0 && !this.onboardingDismissed());

	constructor() {
		effect(() => {
			const tenantId = this.authService.currentUser()?.tenant?.id;
			if (tenantId != null) {
				this.onboardingDismissed.set(localStorage.getItem(this.onboardingKey(tenantId)) === '1');
			}
		});
	}

	private onboardingKey(tenantId: number): string {
		return `seat-app-onboarding-dismissed-${tenantId}`;
	}

	dismissOnboarding(): void {
		const tenantId = this.authService.currentUser()?.tenant?.id;
		if (tenantId != null) localStorage.setItem(this.onboardingKey(tenantId), '1');
		this.onboardingDismissed.set(true);
	}

	upcomingEvents = computed(() => {
		const today = todayKey();
		return this.events()
			.filter((e) => eventDateKey(e.dateOn) >= today)
			.sort((a, b) => a.dateOn.getTime() - b.dateOn.getTime());
	});

	todayEventStats = computed(() => {
		const today = todayKey();
		return this.events()
			.filter((e) => eventDateKey(e.dateOn) === today)
			.map((event) => {
				const capacity = (event.tickets ?? []).reduce((sum, t) => sum + (t.count ?? 0), 0);
				const eventSales = this.saleTickets().filter((s) => s.eventId === event.id);
				const sold = eventSales.length;
				const checkedIn = eventSales.filter((s) => s.checkedInAt).length;
				const available = Math.max(capacity - sold, 0);
				const occupancyPct = sold > 0 ? Math.round((checkedIn / sold) * 100) : 0;
				return { event, capacity, sold, available, checkedIn, occupancyPct };
			});
	});

	// Un panel por evento (de los eventos de HOY) que tiene al menos una puerta configurada — eventos
	// sin puertas no aparecen acá, mismo criterio "opt-in" que el resto de la feature.
	gatePanels = computed(() => {
		const stats = this.gateStatsByEvent();
		return this.todayEventStats()
			.map(({ event }) => ({ event, stats: stats.get(event.id) }))
			.filter((x): x is { event: Events; stats: AccessPointStatsResponse } => !!x.stats && x.stats.accessPoints.length > 0)
			.map(({ event, stats }) => {
				const recentTotal = stats.accessPoints.reduce((sum, g) => sum + g.recentCount, 0);
				const gates = stats.accessPoints.map((g) => {
					const sharePct = recentTotal > 0 ? Math.round((g.recentCount / recentTotal) * 100) : 0;
					const concentrated = recentTotal >= GATE_ALERT_MIN_RECENT && sharePct > GATE_ALERT_CONCENTRATION_PCT;
					return { ...g, perMinute: Math.round((g.recentCount / stats.windowMinutes) * 10) / 10, sharePct, concentrated };
				});
				const concentratedGate = gates.find((g) => g.concentrated);
				return {
					eventId: event.id,
					eventName: event.name,
					eventTotal: stats.eventTotal,
					gates,
					alert: concentratedGate ? `"${concentratedGate.name}" concentra el ${concentratedGate.sharePct}% del tráfico reciente — considera mover personal ahí.` : null,
				};
			});
	});

	// Centavos enteros (ver shared/money.ts) — se convierte a dólares recién al mostrarse.
	totalRevenue = computed(() => {
		const ticketRevenue = this.saleTickets().reduce((sum, sale) => sum + (sale.priceCents ?? sale.ticket?.priceCents ?? 0), 0);
		const productRevenue = this.saleProducts().reduce((sum, sale) => sum + (sale.unitPriceCents ?? sale.product?.priceCents ?? 0) * sale.quantity, 0);
		return ticketRevenue + productRevenue;
	});

	// IDs de los eventos que tienen al menos un movimiento de Finanzas cargado (ver event-transactions
	// en event-details.component.ts) — el promedio de gasto/margen se calcula solo sobre estos, no
	// sobre TODOS los eventos del tenant, porque un evento sin ningún movimiento cargado no aporta
	// información real (no es "gasto cero", es "todavía no se cargó nada").
	private financeEventIds = computed(() => new Set(this.eventTransactions().map((t) => t.eventId)));
	eventsWithFinances = computed(() => this.financeEventIds().size);

	totalExpenses = computed(() => this.eventTransactions().filter((t) => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amountCents, 0));
	totalExtraIncome = computed(() => this.eventTransactions().filter((t) => t.type === 'INCOME').reduce((sum, t) => sum + t.amountCents, 0));

	// Ingresos de tickets+productos, pero acotados a los mismos eventos que financeEventIds — mezclar
	// el margen con ingresos de eventos SIN ningún gasto cargado inflaría el promedio sin sentido.
	private financeScopedRevenue = computed(() => {
		const ids = this.financeEventIds();
		const ticketRevenue = this.saleTickets()
			.filter((s) => ids.has(s.eventId))
			.reduce((sum, sale) => sum + (sale.priceCents ?? sale.ticket?.priceCents ?? 0), 0);
		const productRevenue = this.saleProducts()
			.filter((s) => ids.has(s.eventId))
			.reduce((sum, sale) => sum + (sale.unitPriceCents ?? sale.product?.priceCents ?? 0) * sale.quantity, 0);
		return ticketRevenue + productRevenue;
	});

	avgExpensePerEvent = computed(() => (this.eventsWithFinances() > 0 ? Math.round(this.totalExpenses() / this.eventsWithFinances()) : 0));
	avgMarginPerEvent = computed(() => {
		const n = this.eventsWithFinances();
		if (n === 0) return 0;
		return Math.round((this.financeScopedRevenue() + this.totalExtraIncome() - this.totalExpenses()) / n);
	});

	recentSales = computed(() =>
		[...this.saleTickets()].sort((a, b) => new Date(b.dateSold).getTime() - new Date(a.dateSold).getTime()).slice(0, 5),
	);

	revenueByEvent = computed<BarChartItem[]>(() => {
		const totals = new Map<string, number>();
		for (const sale of this.saleTickets()) {
			const label = sale.event?.name ?? 'Sin evento';
			totals.set(label, (totals.get(label) ?? 0) + (sale.priceCents ?? sale.ticket?.priceCents ?? 0));
		}
		return Array.from(totals, ([label, value]) => ({ label, value: centsToDollars(value) }))
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
			totals.set(label, (totals.get(label) ?? 0) + (sale.unitPriceCents ?? sale.product?.priceCents ?? 0) * sale.quantity);
		}
		return Array.from(totals, ([label, value]) => ({ label, value: centsToDollars(value) }))
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

	private monthKey(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
	}

	// "Ago 2026" — clave interna en formato "YYYY-MM" para poder ordenar cronológicamente sin
	// depender del orden de inserción del Map (las ventas no siempre llegan ordenadas por fecha).
	private monthLabel(key: string): string {
		const [year, month] = key.split('-').map(Number);
		const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
		return `${months[month - 1]} ${year}`;
	}

	private monthlyTotals(reducer: (sale: SaleTicket) => number): BarChartItem[] {
		const totals = new Map<string, number>();
		for (const sale of this.saleTickets()) {
			const key = this.monthKey(new Date(sale.dateSold));
			totals.set(key, (totals.get(key) ?? 0) + reducer(sale));
		}
		return Array.from(totals, ([key, value]) => ({ key, label: this.monthLabel(key), value }))
			.sort((a, b) => a.key.localeCompare(b.key))
			.slice(-12)
			.map(({ label, value }) => ({ label, value }));
	}

	// Tendencia mensual (últimos 12 meses con datos) — a diferencia de los gráficos de arriba, que
	// ordenan por valor descendente, estos se ordenan cronológicamente a propósito: el objetivo es
	// ver evolución en el tiempo, no un ranking.
	// monthlyTotals suma en centavos (ver reducer) — se convierte a dólares recién al construir los
	// items del gráfico, nunca antes.
	monthlyRevenueTrend = computed<BarChartItem[]>(() =>
		this.monthlyTotals((sale) => sale.priceCents ?? sale.ticket?.priceCents ?? 0).map((item) => ({ ...item, value: centsToDollars(item.value) })),
	);
	monthlyTicketsTrend = computed<BarChartItem[]>(() => this.monthlyTotals(() => 1));
	monthsWithSalesCount = computed(() => new Set(this.saleTickets().map((s) => this.monthKey(new Date(s.dateSold)))).size);

	ngOnInit(): void {
		forkJoin({
			events: this.eventsService.getEvents(),
			saleTickets: this.qrService.getQRs(),
			saleProducts: this.productSalesService.getSaleProducts(),
			eventTransactions: this.eventTransactionsService.getAll(),
			users: this.userService.getUsers(),
		}).subscribe(({ events, saleTickets, saleProducts, eventTransactions, users }) => {
			this.events.set(events);
			this.saleTickets.set(saleTickets);
			this.saleProducts.set(saleProducts);
			this.eventTransactions.set(eventTransactions);
			this.users.set(users);
			this.loading.set(false);
			this.loadGateStats(this.todayEventIds(events));
		});

		this.refreshTimer = setInterval(() => {
			forkJoin({
				saleTickets: this.qrService.getQRs(),
				saleProducts: this.productSalesService.getSaleProducts(),
			}).subscribe(({ saleTickets, saleProducts }) => {
				this.saleTickets.set(saleTickets);
				this.saleProducts.set(saleProducts);
				this.loadGateStats(this.todayEventIds(this.events()));
			});
		}, LIVE_REFRESH_MS);
	}

	private todayEventIds(events: Events[]): number[] {
		const today = todayKey();
		return events.filter((e) => eventDateKey(e.dateOn) === today).map((e) => e.id);
	}

	private loadGateStats(eventIds: number[]): void {
		if (!eventIds.length) {
			this.gateStatsByEvent.set(new Map());
			return;
		}
		forkJoin(eventIds.map((id) => this.accessPointsService.getStats(id).pipe(map((stats) => [id, stats] as const)))).subscribe((entries) =>
			this.gateStatsByEvent.set(new Map(entries)),
		);
	}

	ngOnDestroy(): void {
		if (this.refreshTimer) clearInterval(this.refreshTimer);
	}

	formatDate(date: Date): string {
		return new Date(date).toISOString().split('T')[0];
	}
}
