import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublicEventService, PublicOrg, PublicOrgEvent } from '../public-event/services/public-event.service';

type FilterCategory = 'proximos' | 'vencidos' | 'cancelados' | 'pospuestos' | 'inactivos' | 'programados';

const FILTER_LABEL: Record<FilterCategory, string> = {
	proximos: 'Próximos',
	vencidos: 'Vencidos',
	cancelados: 'Cancelados',
	pospuestos: 'Pospuestos',
	inactivos: 'Inactivo',
	programados: 'Programado',
};
const FILTER_ORDER: FilterCategory[] = ['proximos', 'programados', 'vencidos', 'pospuestos', 'cancelados', 'inactivos'];
const DEFAULT_VISIBLE_FILTERS: FilterCategory[] = ['proximos', 'programados'];

@Component({
	selector: 'app-org-landing',
	imports: [RouterLink],
	template: `
		<div class="page" data-bs-theme="dark">
			@switch (step()) {
				@case ('loading') {
					<div class="center-msg">Cargando...</div>
				}
				@case ('not-found') {
					<div class="center-msg">
						<h4>No encontramos esta organización</h4>
						<p class="text-body-secondary">Revisa el link que te compartieron.</p>
					</div>
				}
				@default {
					@if (org(); as o) {
						<header class="org-header">
							<div class="container py-4 d-flex align-items-center gap-3">
								@if (!logoBroken() && o.logoUrl; as logo) {
									<img [src]="logo" alt="" class="org-logo" (error)="logoBroken.set(true)" />
								}
								<div>
									<h1 class="mb-1">{{ o.name }}</h1>
									<p class="text-body-secondary mb-0">Próximos eventos</p>
								</div>
							</div>
						</header>

						<div class="container py-4">
							<input
								type="search"
								class="form-control form-control-lg search-input mb-3"
								placeholder="Buscar por nombre del evento o lugar..."
								[value]="searchText()"
								(input)="searchText.set($any($event.target).value)"
							/>

							<div class="filter-chips mb-4">
								@for (cat of filterOrder; track cat) {
									<button type="button" class="chip" [class.chip-active]="activeFilters().has(cat)" (click)="toggleFilter(cat)">
										{{ filterLabel[cat] }}
									</button>
								}
							</div>

							@if (!filteredEvents().length) {
								<p class="text-body-secondary text-center py-5">
									@if (o.events.length) {
										Ningún evento coincide con tu búsqueda.
									} @else {
										Todavía no hay eventos programados — vuelve a pasar más adelante.
									}
								</p>
							} @else {
								<div class="event-grid">
									@for (event of filteredEvents(); track event.id) {
										@if (statusLabel(event); as label) {
											<div class="event-card event-card-disabled">
												<div class="event-poster">
													@if (event.img) {
														<img [src]="event.img" [alt]="event.name" loading="lazy" />
													} @else {
														<div class="event-poster-fallback">
															<i class="bi bi-calendar-event event-poster-fallback-icon"></i>
															<span class="event-poster-fallback-name">{{ event.name }}</span>
															@if (event.map?.name) {
																<span class="event-poster-fallback-meta">{{ event.map!.name }}</span>
															}
														</div>
													}
													<span class="event-date-badge">{{ formatShortDate(event.dateOn) }}</span>
													<span class="event-status-badge" [title]="event.scheduled ? 'Disponible el ' + formatFullDateTime(event.publishAt) : null">{{
														label
													}}</span>
												</div>
												<div class="event-info">
													<h3 class="event-name">{{ event.name }}</h3>
													<p class="event-meta mb-0">
														{{ formatFullDate(event.dateOn) }}
														@if (event.startTime) {
															— {{ formatStartTime(event.startTime) }}
														}
													</p>
													@if (event.map?.name) {
														<p class="event-meta text-truncate mb-0">{{ event.map!.name }}</p>
													}
												</div>
											</div>
										} @else {
											<a class="event-card" [routerLink]="['/e', event.code]">
												<div class="event-poster">
													@if (event.img) {
														<img [src]="event.img" [alt]="event.name" loading="lazy" />
													} @else {
														<div class="event-poster-fallback">
															<i class="bi bi-calendar-event event-poster-fallback-icon"></i>
															<span class="event-poster-fallback-name">{{ event.name }}</span>
															@if (event.map?.name) {
																<span class="event-poster-fallback-meta">{{ event.map!.name }}</span>
															}
														</div>
													}
													<span class="event-date-badge">{{ formatShortDate(event.dateOn) }}</span>
												</div>
												<div class="event-info">
													<h3 class="event-name">{{ event.name }}</h3>
													<p class="event-meta mb-0">
														{{ formatFullDate(event.dateOn) }}
														@if (event.startTime) {
															— {{ formatStartTime(event.startTime) }}
														}
													</p>
													@if (event.map?.name) {
														<p class="event-meta text-truncate mb-0">{{ event.map!.name }}</p>
													}
												</div>
											</a>
										}
									}
								</div>
							}
						</div>
					}
				}
			}
		</div>
	`,
	styles: [
		`
			.page {
				min-height: 100vh;
				background: #0a0a0a;
				color: #fff;
				overflow-x: hidden;
			}
			.center-msg {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
			}
			.org-header {
				background: linear-gradient(180deg, rgba(var(--app-accent-rgb, 220, 53, 69), 0.18), transparent);
				border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			}
			.org-header h1 {
				font-weight: 700;
			}
			.org-logo {
				width: 64px;
				height: 64px;
				border-radius: 50%;
				object-fit: cover;
				background: #fff;
				border: 1px solid rgba(255, 255, 255, 0.15);
				flex-shrink: 0;
			}
			.search-input {
				background: #16181d;
				border-color: #2a2d34;
				color: #fff;
			}
			.search-input::placeholder {
				color: #7a7f8a;
			}
			.search-input:focus {
				background: #16181d;
				color: #fff;
				border-color: var(--app-accent);
				box-shadow: 0 0 0 0.25rem rgba(var(--app-accent-rgb, 220, 53, 69), 0.25);
			}
			.filter-chips {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem;
			}
			.chip {
				background: #16181d;
				border: 1px solid #2a2d34;
				color: #9aa0aa;
				font-size: 0.8rem;
				font-weight: 600;
				padding: 0.35rem 0.85rem;
				border-radius: 999px;
				transition:
					background 0.15s ease,
					color 0.15s ease,
					border-color 0.15s ease;
			}
			.chip:hover {
				border-color: var(--app-accent);
				color: #fff;
			}
			.chip-active {
				background: var(--app-accent);
				border-color: var(--app-accent);
				color: #fff;
			}
			.event-grid {
				display: grid;
				grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
				gap: 1.25rem;
			}
			.event-card {
				display: flex;
				flex-direction: column;
				color: inherit;
				text-decoration: none;
				border-radius: 0.5rem;
				overflow: hidden;
				background: #16181d;
				border: 1px solid #2a2d34;
				transition:
					transform 0.15s ease,
					border-color 0.15s ease;
			}
			.event-card:hover {
				transform: translateY(-3px);
				border-color: var(--app-accent);
			}
			.event-card-disabled {
				cursor: not-allowed;
			}
			.event-card-disabled .event-poster {
				filter: grayscale(1);
				opacity: 0.55;
			}
			.event-card-disabled .event-info {
				opacity: 0.55;
			}
			.event-status-badge {
				position: absolute;
				top: 0.5rem;
				right: 0.5rem;
				background: rgba(0, 0, 0, 0.85);
				color: #fff;
				font-size: 0.7rem;
				font-weight: 700;
				padding: 0.2rem 0.5rem;
				border-radius: 0.25rem;
				text-transform: uppercase;
			}
			.event-poster {
				position: relative;
				aspect-ratio: 3 / 4;
				background: #1c1f24;
			}
			.event-poster img {
				width: 100%;
				height: 100%;
				object-fit: cover;
				display: block;
			}
			/* Placeholder para eventos sin foto todavía — antes era solo el nombre centrado sobre un
			   gradiente plano, se veía como un error de carga más que un diseño a propósito. Ahora
			   suma una textura sutil, un ícono y (si el evento tiene mapa asignado) el lugar, para que
			   se lea como una portada mientras el manager no sube la imagen real. */
			.event-poster-fallback {
				position: relative;
				width: 100%;
				height: 100%;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.6rem;
				padding: 1.25rem;
				text-align: center;
				overflow: hidden;
				background:
					radial-gradient(circle at 25% 15%, rgba(255, 255, 255, 0.12), transparent 55%),
					linear-gradient(135deg, var(--app-accent), #1c1f24 78%);
			}
			.event-poster-fallback::before {
				content: '';
				position: absolute;
				inset: -25%;
				background-image: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 2px, transparent 2px 16px);
				pointer-events: none;
			}
			.event-poster-fallback-icon {
				position: relative;
				font-size: 1.75rem;
				color: rgba(255, 255, 255, 0.55);
			}
			.event-poster-fallback-name {
				position: relative;
				font-weight: 700;
				font-size: 1.05rem;
				line-height: 1.3;
				color: #fff;
				text-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
			}
			.event-poster-fallback-meta {
				position: relative;
				font-size: 0.7rem;
				font-weight: 600;
				letter-spacing: 0.04em;
				text-transform: uppercase;
				color: rgba(255, 255, 255, 0.75);
			}
			.event-date-badge {
				position: absolute;
				top: 0.5rem;
				left: 0.5rem;
				background: rgba(0, 0, 0, 0.7);
				color: #fff;
				font-size: 0.7rem;
				font-weight: 600;
				padding: 0.2rem 0.5rem;
				border-radius: 0.25rem;
				text-transform: uppercase;
			}
			.event-info {
				padding: 0.75rem 0.9rem 1rem;
			}
			.event-name {
				font-size: 1rem;
				font-weight: 700;
				margin-bottom: 0.25rem;
				line-height: 1.25;
			}
			.event-meta {
				font-size: 0.8rem;
				color: #9aa0aa;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrgLandingComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly publicEventService = inject(PublicEventService);
	private readonly destroyRef = inject(DestroyRef);

	step = signal<'loading' | 'not-found' | 'ready'>('loading');
	org = signal<PublicOrg | null>(null);
	searchText = signal('');
	logoBroken = signal(false);

	filterOrder = FILTER_ORDER;
	filterLabel = FILTER_LABEL;
	// Próximos + Programados visibles por default — el resto (vencidos, cancelados, pospuestos,
	// inactivos) queda oculto hasta que el visitante lo pida a propósito con un chip, para que la
	// portada no se llene de eventos que ya no importan para alguien que llega por primera vez.
	activeFilters = signal<Set<FilterCategory>>(new Set(DEFAULT_VISIBLE_FILTERS));

	// Tickea cada minuto para que el conteo regresivo de eventos "Próximamente" (ver statusLabel) se
	// vaya achicando solo mientras alguien tiene la portada abierta, sin necesitar un refresh manual.
	// Cada minuto alcanza de sobra acá — no es un cronómetro, es un badge en una tarjeta.
	now = signal(new Date());

	constructor() {
		const intervalId = setInterval(() => this.now.set(new Date()), 60_000);
		this.destroyRef.onDestroy(() => clearInterval(intervalId));
	}

	filteredEvents = computed(() => {
		const term = this.searchText().trim().toLowerCase();
		const filters = this.activeFilters();
		const events = this.org()?.events ?? [];
		return events.filter((e: PublicOrgEvent) => {
			if (!filters.has(this.eventCategory(e))) return false;
			if (!term) return true;
			return `${e.name} ${e.map?.name ?? ''}`.toLowerCase().includes(term);
		});
	});

	toggleFilter(cat: FilterCategory) {
		this.activeFilters.update((current) => {
			const next = new Set(current);
			if (next.has(cat)) next.delete(cat);
			else next.add(cat);
			return next;
		});
	}

	ngOnInit(): void {
		const slug = this.route.snapshot.paramMap.get('slug');
		if (!slug) {
			this.step.set('not-found');
			return;
		}
		this.publicEventService.getOrg(slug).subscribe({
			next: (org) => {
				this.org.set(org);
				this.step.set('ready');
			},
			error: () => this.step.set('not-found'),
		});
	}

	// null = evento seleccionable normalmente. Si no, la card se muestra sin link (ver template) —
	// mismo criterio que el gate de compra en public-event.component.ts, calculado en el backend acá
	// (ver GET /public/org/:slug) para no tener que traer tickets/precios a este listado público.
	// "Inactivo" (sin tickets cargados todavía) se distingue de "Agotado" (sí tuvo, se vendieron todos)
	// para no confundir un evento a futuro sin terminar de configurar con uno que de verdad se agotó.
	statusLabel(event: PublicOrgEvent): string | null {
		if (event.status === 'CANCELLED') return 'Cancelado';
		if (event.status === 'POSTPONED') return 'Pospuesto';
		if (event.scheduled) return this.countdownLabel(event.publishAt);
		if (event.inactive) return 'Inactivo';
		// Distinto de soldOut: el aforo compartido del evento ya se llenó aunque algún tipo de ticket
		// todavía tenga stock propio (ver Event.maxCapacity, lib/capacity.ts en la API).
		if (event.capacityFull) return 'Aforo completo';
		if (event.soldOut) return 'Agotado';
		return null;
	}

	// Un evento cae en exactamente un balde para el filtro de la portada — mismo orden de prioridad
	// que statusLabel() (cancelado/pospuesto pesa más que cualquier otra cosa), salvo que acá
	// "vencido" (ya pasó dateOff) también cuenta como balde propio en vez de perderse dentro de
	// "próximos". "Inactivo" (sin tickets cargados) y "programado" (publishAt a futuro) son los mismos
	// casos que ya calcula el backend.
	eventCategory(event: PublicOrgEvent): FilterCategory {
		if (event.status === 'CANCELLED') return 'cancelados';
		if (event.status === 'POSTPONED') return 'pospuestos';
		if (event.scheduled) return 'programados';
		if (event.inactive) return 'inactivos';
		if (new Date(event.dateOff) < this.now()) return 'vencidos';
		return 'proximos';
	}

	// Lee `now()` a propósito — al tickear (ver constructor) esto se recalcula solo en cada render, sin
	// eso el conteo quedaría congelado en el momento en que cargó la página.
	private countdownLabel(publishAt: string | null): string {
		if (!publishAt) return 'Próximamente';
		const diffMs = new Date(publishAt).getTime() - this.now().getTime();
		if (diffMs <= 0) return 'Próximamente';
		const days = Math.floor(diffMs / 86_400_000);
		const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
		const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
		if (days > 0) return `En ${days}d ${hours}h`;
		if (hours > 0) return `En ${hours}h ${minutes}m`;
		if (minutes > 0) return `En ${minutes}m`;
		return 'Ya casi';
	}

	// publishAt es un instante real (a diferencia de dateOn, que representa un día calendario a
	// medianoche UTC) — se muestra en hora local del visitante, igual que en public-event.component.ts.
	formatFullDateTime(publishAt: string | null): string {
		if (!publishAt) return '';
		return new Date(publishAt).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
	}

	// dateOn es un instante UTC medianoche que representa un día calendario — usar getters UTC para
	// no perder un día en timezones detrás de UTC (ver utils/dates.ts).
	formatShortDate(iso: string): string {
		return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
	}

	formatFullDate(iso: string): string {
		return new Date(iso).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
	}

	// startTime se guarda como "HH:mm" en 24h — se muestra en 12h con AM/PM para el comprador.
	formatStartTime(startTime: string): string {
		const [hoursStr, minutesStr] = startTime.split(':');
		const hours24 = Number(hoursStr);
		const minutes = Number(minutesStr);
		if (Number.isNaN(hours24) || Number.isNaN(minutes)) return startTime;
		const period = hours24 >= 12 ? 'PM' : 'AM';
		const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
		return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
	}
}
