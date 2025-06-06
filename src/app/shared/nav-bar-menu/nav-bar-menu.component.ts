import { Component, AfterViewInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import * as bootstrap from "bootstrap";
import { filter } from 'rxjs';

type MenuItem = { title: string; icon: string; url: string};
@Component({
	selector: 'shared-nav-bar-menu',
	imports: [RouterLink],
	template: `
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
							<button class="btn btn-dark mb-2" [routerLink]="item.url">
								@if (item.icon) {
									<i [class]="item.icon"></i>
								}
							</button>
						}
					</div>
				</div>
			</div>
		</div>

		<div class="offcanvas offcanvas-start" tabindex="-1" id="offcanvas" aria-labelledby="offcanvasLabel" style="width: 12vw;">
			<div class="p-1" style="height: 5%">
				<div class="d-flex flex-row  mb-3">
					<div class="p-2 flex-grow-1">
						<span>Seat App version 1.0.0</span>
					</div>
					<div class="p-2">
						<button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button>
					</div>
				</div>
			</div>
			<div class=" d-flex justify-content-center  flex-column" style="height: 90%">
				@for (item of menuList; track item.title) {
					<button [class]="path().includes(item.url) ? 'btn btn-danger mb-2' : 'btn btn-dark mb-2'" [routerLink]="item.url" style="width: 100%;">
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
							<button class="btn btn-dark mb-2" [routerLink]="item.url">
								@if (item.icon) {
									<i [class]="item.icon"></i>
								}
							</button>
						}
					</div>
				</div>
			</div>
		</div>
	`,
	styleUrl: './nav-bar-menu.component.css',
})
export class NavBarMenuComponent implements AfterViewInit {
	router = inject(Router)
	path = signal<string>('');
	menuList: Array<MenuItem> = [
		{ title: 'Dash Board', icon: 'bi bi-speedometer', url: '/manager/dash-board' },
		{ title: 'Events', icon: 'bi bi-calendar-event', url: '/manager/events' },
		{ title: 'Maps', icon: 'bi bi-map', url: '/manager/maps' },
		{ title: 'Tickets', icon: 'bi bi-ticket-fill', url: '/manager/tickets' },
		{ title: 'Users', icon: 'bi bi-people-fill', url: '/manager/users' },
		{ title: 'Sale', icon: 'bi bi-receipt', url: '/manager/sales' },
		{ title: 'Products', icon: 'bi bi-calendar2-event-fill', url: '/manager/products' },
		{ title: 'Reports', icon: 'bi bi-flag-fill', url: '/manager/reports' },
		{ title: 'QRs', icon: 'bi bi-qr-code', url: '/manager/qrs' },
		{ title: 'History', icon: 'bi bi-clock-history', url: '/manager/history' },
	];

	menuExit: Array<MenuItem> = [{ title: 'Exit', icon: 'bi bi-box-arrow-left', url: '/site-web' }];

	ngAfterViewInit(): void {
		this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
			this.path.set(event.urlAfterRedirects);
		});
		this.showOffCanvas();
	}

	showOffCanvas() {
		const offCanvas = document.getElementById('offcanvas');
		if (offCanvas) {
			const bsOffCanvas = new bootstrap.Offcanvas(offCanvas);
			bsOffCanvas.show();
		}
	}
}
