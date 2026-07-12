import { Component, AfterViewInit, HostListener, inject, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import * as bootstrap from "bootstrap";
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

type MenuItem = { title: string; icon: string; url: string};

// Por debajo de este ancho, un sidebar con nombres siempre visible le come la mitad de la
// pantalla al contenido real — coincide con el breakpoint "md" de Bootstrap.
const DESKTOP_BREAKPOINT_PX = 768;

@Component({
	selector: 'shared-nav-bar-menu',
	imports: [RouterLink],
	template: `
		@if (isDesktop()) {
			<!-- Sidebar permanente EN FLUJO normal (no offcanvas: ese siempre es position:fixed en
			     Bootstrap, así que "mostrarlo" en desktop lo dejaba flotando ENCIMA del contenido en
			     vez de compartir el ancho con él — el contenido de abajo quedaba tapado). -->
			<div class="d-flex flex-column permanent-sidebar">
				<div class="d-flex flex-column flex-grow-1 px-2 pt-2">
					@for (item of menuList; track item.title) {
						<button [class]="path().includes(item.url) ? 'btn btn-danger mb-1 nav-item-btn' : 'btn btn-dark mb-1 nav-item-btn'" [routerLink]="item.url">
							@if (item.icon) {
								<i [class]="item.icon"></i>
							}
							{{ item.title }}
						</button>
					}
				</div>
				<div class="p-2">
					@for (item of menuExit; track item.title) {
						<button class="btn btn-dark mb-1 nav-item-btn" (click)="logout()">
							@if (item.icon) {
								<i [class]="item.icon"></i>
							}
							{{ item.title }}
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
					@for (item of menuList; track item.title) {
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
							<button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
						</div>
					</div>
				</div>
				<div class="d-flex flex-column" style="height: 90%">
					@for (item of menuList; track item.title) {
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
	path = signal<string>('');
	isDesktop = signal<boolean>(typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT_PX : true);
	private bsOffCanvas: bootstrap.Offcanvas | null = null;

	// Orden alineado al flujo real de trabajo: crear evento → asignar mapa → armar áreas/asientos →
	// crear tickets → vender/generar QR → ver quién compró. "Sale" quedó como página muerta,
	// superada por QRs (que ya cubre venta de tickets y productos).
	menuList: Array<MenuItem> = [
		{ title: 'Dash Board', icon: 'bi bi-speedometer', url: '/manager/dash-board' },
		{ title: 'Events', icon: 'bi bi-calendar-event', url: '/manager/events' },
		{ title: 'Maps', icon: 'bi bi-map', url: '/manager/maps' },
		{ title: 'Tickets', icon: 'bi bi-ticket-fill', url: '/manager/tickets' },
		{ title: 'QRs', icon: 'bi bi-qr-code', url: '/manager/qrs' },
		{ title: 'Users', icon: 'bi bi-people-fill', url: '/manager/users' },
		{ title: 'Sale', icon: 'bi bi-receipt', url: '/manager/sales' },
		{ title: 'Products', icon: 'bi bi-calendar2-event-fill', url: '/manager/products' },
		{ title: 'Reports', icon: 'bi bi-flag-fill', url: '/manager/reports' },
		{ title: 'History', icon: 'bi bi-clock-history', url: '/manager/history' },
		{ title: 'Settings', icon: 'bi bi-palette', url: '/manager/settings' },
	];

	menuExit: Array<MenuItem> = [{ title: 'Exit', icon: 'bi bi-box-arrow-left', url: '/site-web' }];

	@HostListener('window:resize')
	onResize() {
		this.isDesktop.set(window.innerWidth >= DESKTOP_BREAKPOINT_PX);
	}

	ngAfterViewInit(): void {
		this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
			this.path.set(event.urlAfterRedirects);
		});
		this.initOffCanvas();
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
		this.router.navigate(['/site-web']);
	}
}
