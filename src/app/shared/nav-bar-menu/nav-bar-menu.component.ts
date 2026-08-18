import { Component, AfterViewInit, computed, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import * as bootstrap from "bootstrap";
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { PLAN_FEATURES, PlanCode, PlanFeatures } from '../pricing-plans';
import { EVENT_PLANS, isEventPlanCode } from '../event-plans';
import { SubscriptionService, OverageNudge } from '../../modules/manager/subscription/subscription.service';

type MenuItem = { title: string; icon: string; url: string};

// Secciones que no están incluidas en todos los planes — todo lo que NO aparece acá se considera
// baseline (Dashboard, Events, Maps, Tickets, QRs, Users, Sale, Settings) y nunca se oculta, sin
// importar el plan.
const MENU_ITEM_FEATURE: Partial<Record<string, keyof PlanFeatures>> = {
	Productos: 'productsModule',
	Reportes: 'advancedReporting',
	Historial: 'advancedReporting',
	Sedes: 'multiLocation',
};

const PLAN_NAME: Record<PlanCode, string> = { BASICO: 'Básico', INTERMEDIO: 'Intermedio', AVANZADO: 'Avanzado', PRO_MAX: 'Pro Enterprise' };
// EVENT_ENDED es propio de un tenant de evento único (ver shared/event-plans.ts) — su evento ya
// pasó, quedó en modo de solo consulta (ver active-subscription.guard.ts).
const STATUS_LABEL: Record<string, string> = {
	PENDING: 'Pendiente de pago',
	ACTIVE: 'Activa',
	PAST_DUE: 'Pago vencido',
	SUSPENDED: 'Suspendida',
	CANCELLED: 'Cancelada',
	EVENT_ENDED: 'Modo consulta',
	// Propio de un tenant de evento único que pagó por transferencia — comprobante subido, espera
	// revisión manual del Super Admin (ver routes/signup-event.ts).
	PENDING_REVIEW: 'En revisión',
};

// Por debajo de este ancho, un sidebar con nombres siempre visible le come la mitad de la
// pantalla al contenido real — coincide con el breakpoint "md" de Bootstrap.
const DESKTOP_BREAKPOINT_PX = 768;
const SIDEBAR_COLLAPSED_KEY = 'seat-app-sidebar-collapsed';

@Component({
	selector: 'shared-nav-bar-menu',
	imports: [RouterLink],
	template: `
		@if (isDesktop()) {
			<!-- Sidebar permanente EN FLUJO normal (no offcanvas: ese siempre es position:fixed en
			     Bootstrap, así que "mostrarlo" en desktop lo dejaba flotando ENCIMA del contenido en
			     vez de compartir el ancho con él — el contenido de abajo quedaba tapado). -->
			<div class="d-flex flex-column permanent-sidebar" [class.collapsed]="sidebarCollapsed()">
				<div class="p-2 d-flex" [class.justify-content-end]="!sidebarCollapsed()" [class.justify-content-center]="sidebarCollapsed()">
					<button
						type="button"
						class="btn btn-dark btn-sm"
						(click)="toggleSidebar()"
						[title]="sidebarCollapsed() ? 'Expandir menú' : 'Reducir menú'"
					>
						<i class="bi" [class.bi-chevron-double-right]="sidebarCollapsed()" [class.bi-chevron-double-left]="!sidebarCollapsed()"></i>
					</button>
				</div>
				@if (tenantName(); as name) {
					<div class="px-2 pb-2 tenant-badge" [title]="name">
						@if (!tenantLogoBroken() && tenantLogoUrl(); as logo) {
							<img [src]="logo" alt="" class="tenant-logo" (error)="tenantLogoBroken.set(true)" />
						} @else {
							<i class="bi bi-building"></i>
						}
						@if (!sidebarCollapsed()) {
							<span class="ms-1">{{ name }}</span>
						}
					</div>
				}
				@if (planBadge(); as badge) {
					<div class="px-2 pb-2 plan-badge" [class.justify-content-center]="sidebarCollapsed()">
						<span
							class="badge"
							[class.text-bg-success]="badge.status === 'ACTIVE'"
							[class.text-bg-warning]="badge.status === 'PAST_DUE' || badge.status === 'PENDING'"
							[class.text-bg-secondary]="badge.status === 'SUSPENDED' || badge.status === 'CANCELLED'"
							[class.text-bg-info]="badge.status === 'EVENT_ENDED' || badge.status === 'PENDING_REVIEW'"
							[title]="badge.planName + ' — ' + badge.statusLabel"
						>
							{{ badge.planName }}
						</span>
						@if (!sidebarCollapsed()) {
							<a routerLink="/manager/suscripcion" class="upgrade-link ms-1" title="Ver y actualizar plan">
								<i class="bi bi-arrow-up-circle"></i> Actualizar
							</a>
						} @else {
							<a routerLink="/manager/suscripcion" class="upgrade-link" title="Ver y actualizar plan">
								<i class="bi bi-arrow-up-circle"></i>
							</a>
						}
					</div>
				}
				@if (overageNudge()?.shouldUpgrade && !sidebarCollapsed()) {
					<div class="px-2 pb-2 upgrade-nudge">
						<a routerLink="/manager/suscripcion" class="small d-block" title="Ver planes">
							<i class="bi bi-graph-up-arrow" aria-hidden="true"></i>
							El excedente de tus eventos ya supera lo que costaría {{ overageNudge()?.suggestedPlanName }}
						</a>
					</div>
				}
				<div class="d-flex flex-column flex-grow-1 px-2">
					@for (item of visibleMenuList(); track item.title) {
						<button
							[class]="path().includes(item.url) ? 'btn btn-danger mb-1 nav-item-btn' : 'btn btn-dark mb-1 nav-item-btn'"
							[routerLink]="item.url"
							[title]="item.title"
						>
							@if (item.icon) {
								<i [class]="item.icon"></i>
							}
							@if (!sidebarCollapsed()) {
								{{ item.title }}
							}
						</button>
					}
				</div>
				<div class="p-2">
					@for (item of menuExit; track item.title) {
						<button class="btn btn-dark mb-1 nav-item-btn" (click)="logout()" [title]="item.title">
							@if (item.icon) {
								<i [class]="item.icon"></i>
							}
							@if (!sidebarCollapsed()) {
								{{ item.title }}
							}
						</button>
					}
				</div>
			</div>
		} @else {
			<div class="d-flex flex-column mb-3 nav-bar-h">
				<div class="p-3" style="height: 5%">
					<a data-bs-toggle="offcanvas" id="offCanvasBtn" href="#offcanvas" aria-controls="offcanvas" style="height: 100%">
						<i class="bi bi-list"></i>
					</a>
				</div>
				<div class="p-1 d-flex justify-content-center  flex-column" style="height: 90%">
					@for (item of visibleMenuList(); track item.title) {
						<div class="mb-1">
							<button [class]="path().includes(item.url) ? 'btn btn-danger mb-2' : 'btn btn-dark mb-2'" [routerLink]="item.url">
								@if (item.icon) {
									<i [class]="item.icon"></i>
								}
							</button>
						</div>
					}
				</div>
				<div class="p-1" style="height: 5%">
					<div class="d-flex align-items-start flex-column mb-3" style="height: 100%">
						<div class="mt-auto">
							@for (item of menuExit; track item.title) {
								<button class="btn btn-dark mb-2" (click)="logout()">
									@if (item.icon) {
										<i [class]="item.icon"></i>
									}
								</button>
							}
						</div>
					</div>
				</div>
			</div>

			<div class="offcanvas offcanvas-start nav-offcanvas" tabindex="-1" id="offcanvas" aria-labelledby="offcanvasLabel">
				<div class="p-1" style="height: 5%">
					<div class="d-flex flex-row justify-content-end mb-3">
						<div class="p-2">
							<button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
						</div>
					</div>
					@if (tenantName(); as name) {
						<div class="px-3 pb-2 tenant-badge">
							@if (!tenantLogoBroken() && tenantLogoUrl(); as logo) {
								<img [src]="logo" alt="" class="tenant-logo" (error)="tenantLogoBroken.set(true)" />
							} @else {
								<i class="bi bi-building"></i>
							}
							<span class="ms-1">{{ name }}</span>
						</div>
					}
					@if (planBadge(); as badge) {
						<div class="px-3 pb-2 plan-badge">
							<span
								class="badge"
								[class.text-bg-success]="badge.status === 'ACTIVE'"
								[class.text-bg-warning]="badge.status === 'PAST_DUE' || badge.status === 'PENDING'"
								[class.text-bg-secondary]="badge.status === 'SUSPENDED' || badge.status === 'CANCELLED'"
								[class.text-bg-info]="badge.status === 'EVENT_ENDED' || badge.status === 'PENDING_REVIEW'"
							>
								{{ badge.planName }}
							</span>
							<a routerLink="/manager/suscripcion" class="upgrade-link ms-1">
								<i class="bi bi-arrow-up-circle"></i> Actualizar
							</a>
						</div>
					}
					@if (overageNudge()?.shouldUpgrade) {
						<div class="px-3 pb-2 upgrade-nudge">
							<a routerLink="/manager/suscripcion" class="small d-block">
								<i class="bi bi-graph-up-arrow" aria-hidden="true"></i>
								El excedente de tus eventos ya supera lo que costaría {{ overageNudge()?.suggestedPlanName }}
							</a>
						</div>
					}
				</div>
				<div class="d-flex flex-column" style="height: 90%">
					@for (item of visibleMenuList(); track item.title) {
						<button [class]="path().includes(item.url) ? 'btn btn-danger mb-2 nav-item-btn' : 'btn btn-dark mb-2 nav-item-btn'" [routerLink]="item.url">
							@if (item.icon) {
								<i [class]="item.icon"></i>
							}
							{{ item.title }}
						</button>
					}
				</div>
				<div class="p-1" style="height: 5%">
					<div class="d-flex align-items-end flex-column mb-3" style="height: 100%">
						<div class="mt-auto">
							@for (item of menuExit; track item.title) {
								<button class="btn btn-dark mb-2" (click)="logout()">
									@if (item.icon) {
										<i [class]="item.icon"></i>
									}
								</button>
							}
						</div>
					</div>
				</div>
			</div>
		}
	`,
	styleUrl: './nav-bar-menu.component.css',
})
export class NavBarMenuComponent implements AfterViewInit, OnDestroy {
	router = inject(Router)
	private readonly authService = inject(AuthService);
	private readonly subscriptionService = inject(SubscriptionService);
	path = signal<string>('');
	isDesktop = signal<boolean>(typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true);
	sidebarCollapsed = signal<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
	private bsOffCanvas: bootstrap.Offcanvas | null = null;

	// Un mismo navegador puede pasar de una sesión de un cliente a otra (ej. soporte atendiendo a
	// varios clubes) — mostrar la organización activa evita confundir a qué cuenta pertenecen los
	// cambios que se están haciendo.
	tenantName = computed(() => this.authService.currentUser()?.tenant?.name ?? null);
	tenantLogoUrl = computed(() => this.authService.currentUser()?.tenant?.logoUrl ?? null);
	tenantLogoBroken = signal(false);

	// Se pide UNA vez al cargar el menú (ver ngAfterViewInit) — no reactivo al tenant porque este
	// sidebar vive dentro del layout autenticado, nunca sobrevive un cambio de organización sin una
	// recarga completa de la página (login/logout). shouldUpgrade=false por default hasta que
	// responda, así que el nudge simplemente no aparece hasta tener la respuesta real.
	overageNudge = signal<OverageNudge | null>(null);

	// null cuando el tenant no tiene plan asignado (organizaciones dadas de alta antes de que
	// existiera el sistema de suscripciones) — mismo criterio que getTenantPlanFeatures en el backend.
	planBadge = computed(() => {
		const tenant = this.authService.currentUser()?.tenant;
		if (!tenant?.plan || !tenant?.planStatus) return null;
		// Un tenant de evento único (ver shared/event-plans.ts) no tiene entrada en PLAN_NAME —
		// se resuelve el nombre desde su propio catálogo de tiers en su lugar.
		const planName = isEventPlanCode(tenant.plan) ? (EVENT_PLANS.find((t) => t.code === tenant.plan)?.name ?? tenant.plan) : PLAN_NAME[tenant.plan];
		return {
			planName,
			status: tenant.planStatus,
			statusLabel: STATUS_LABEL[tenant.planStatus] ?? tenant.planStatus,
		};
	});

	// Oculta las secciones que el plan del tenant no incluye (Products/Reports/History según el
	// plan) — sin plan asignado, no se restringe nada (mismo criterio que el backend).
	visibleMenuList = computed(() => {
		// Un usuario SCANNER (ver User.scannerEventId, core/guards/scanner-role.guard.ts) solo puede
		// entrar a /manager/events/qr-scanner, sin acceso a ninguna otra sección — no hay nada útil
		// que este menú pueda ofrecerle, así que se oculta entero (queda solo "Exit", ver menuExit).
		if (this.authService.currentUser()?.type?.type === 'SCANNER') return [];
		const tenant = this.authService.currentUser()?.tenant;
		// Un tenant de evento único (ver shared/event-plans.ts) no tiene entrada en PLAN_FEATURES —
		// mismo criterio que sin plan asignado, no se restringe nada.
		if (!tenant?.plan || isEventPlanCode(tenant.plan)) return this.menuList;
		const features = PLAN_FEATURES[tenant.plan];
		return this.menuList.filter((item) => {
			const required = MENU_ITEM_FEATURE[item.title];
			return !required || features[required];
		});
	});

	// Orden alineado al flujo real de trabajo: crear evento → asignar mapa → armar áreas/asientos →
	// crear tickets → vender/generar QR → ver quién compró. "Sale" (página muerta, sin construir)
	// se repurposeó como "Invoices" — historial de facturas de la propia organización (ver
	// api/src/lib/invoice-generation.ts), no ventas de tickets/productos (eso lo cubre QRs).
	menuList: Array<MenuItem> = [
		{ title: 'Panel', icon: 'bi bi-speedometer', url: '/manager/dash-board' },
		{ title: 'Eventos', icon: 'bi bi-calendar-event', url: '/manager/events' },
		{ title: 'Mapas', icon: 'bi bi-map', url: '/manager/maps' },
		{ title: 'Tickets', icon: 'bi bi-ticket-fill', url: '/manager/tickets' },
		{ title: 'QRs', icon: 'bi bi-qr-code', url: '/manager/qrs' },
		{ title: 'Usuarios', icon: 'bi bi-people-fill', url: '/manager/users' },
		{ title: 'Sedes', icon: 'bi bi-geo-alt-fill', url: '/manager/locations' },
		{ title: 'Facturas', icon: 'bi bi-receipt', url: '/manager/invoices' },
		{ title: 'Productos', icon: 'bi bi-calendar2-event-fill', url: '/manager/products' },
		{ title: 'Reportes', icon: 'bi bi-flag-fill', url: '/manager/reports' },
		{ title: 'Historial', icon: 'bi bi-clock-history', url: '/manager/history' },
		// Sin entrada en MENU_ITEM_FEATURE a propósito — visible en todos los planes, es un canal de
		// upsell (renta de equipos, personal presencial, etc.), no una feature a restringir.
		{ title: 'Solicitudes', icon: 'bi bi-headset', url: '/manager/solicitudes' },
		// Mismo criterio que Solicitudes: sin gating de plan, contenido estático de ayuda.
		{ title: 'Ayuda', icon: 'bi bi-question-circle', url: '/manager/ayuda' },
		{ title: 'Configuración', icon: 'bi bi-palette', url: '/manager/settings' },
	];

	menuExit: Array<MenuItem> = [{ title: 'Salir', icon: 'bi bi-box-arrow-left', url: '/site-web' }];

	@HostListener('window:resize')
	onResize() {
		this.isDesktop.set(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
	}

	toggleSidebar() {
		this.sidebarCollapsed.update((collapsed) => {
			const next = !collapsed;
			localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
			return next;
		});
	}

	ngAfterViewInit(): void {
		this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
			this.path.set(event.urlAfterRedirects);
		});
		this.initOffCanvas();
		// Best-effort: si falla (tenant sin plan recurrente reconocido, red, etc.) el nudge
		// simplemente no aparece — no es información crítica como para bloquear nada del menú.
		this.subscriptionService.getOverageNudge().subscribe({
			next: (nudge) => this.overageNudge.set(nudge),
			error: () => {},
		});
	}

	initOffCanvas() {
		const offCanvas = document.getElementById('offcanvas');
		if (!offCanvas) return;
		// El offcanvas de mobile arranca siempre cerrado — el usuario lo abre a mano con el ícono
		// de hamburguesa. backdrop:true para que se comporte como un drawer normal (click afuera
		// o Esc lo cierra), a diferencia del viejo sidebar "permanente" que ahora es otro branch.
		this.bsOffCanvas = new bootstrap.Offcanvas(offCanvas, { backdrop: true, scroll: true });
	}

	ngOnDestroy(): void {
		this.bsOffCanvas?.dispose();
	}

	logout() {
		this.authService.logout();
		this.router.navigate(['/login/sign-in']);
	}
}
