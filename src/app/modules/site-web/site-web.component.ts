import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavBarInitComponent } from '../../shared/nav-bar-init/nav-bar-init.component';
import { PRICING_PLANS } from '../../shared/pricing-plans';

@Component({
	selector: 'app-site-web',
	standalone: true,
	imports: [NavBarInitComponent, RouterLink],
	template: `
		<app-nav-bar-init />
		<div class="page" data-bs-theme="dark">
			<div class="hero text-center py-5">
				<div class="container">
					<h1 class="display-5 fw-bold mb-3">Vendé entradas y controlá el acceso de tu club o iglesia</h1>
					<p class="lead" style="color: #b9b9b9;">Mapa de asientos, QR de entrada, portal público de auto-registro y cobro online — todo en un solo lugar.</p>
					<a routerLink="/signup" class="btn btn-danger btn-lg px-4 mt-2">Empezar ahora</a>
				</div>
			</div>

			<div class="container py-5">
				<h2 class="text-center mb-4">Planes</h2>
				<div class="row g-3 justify-content-center">
					@for (plan of plans; track plan.code) {
						<div class="col-12 col-md-6 col-lg-3">
							<div class="card h-100 bg-dark-subtle-card" [class.border-danger]="plan.highlighted">
								<div class="card-body d-flex flex-column">
									@if (plan.highlighted) {
										<span class="badge text-bg-danger align-self-start mb-2">Más elegido</span>
									}
									<h3 class="h5">{{ plan.name }}</h3>
									<p class="mb-1"><span class="fs-3 fw-bold">\${{ plan.priceUSD }}</span><span style="color: #b9b9b9;">/mes</span></p>
									<p class="small mb-3" style="color: #b9b9b9;">Hasta {{ plan.attendeesPerEvent }} asistentes por evento</p>
									<ul class="list-unstyled small flex-grow-1">
										@for (feature of plan.features; track feature) {
											<li class="mb-1"><i class="bi bi-check2 text-danger"></i> {{ feature }}</li>
										}
									</ul>
									<a [routerLink]="['/signup']" [queryParams]="{ plan: plan.code }" class="btn btn-outline-danger mt-2">Elegir {{ plan.name }}</a>
								</div>
							</div>
						</div>
					}
				</div>
			</div>
		</div>
	`,
	styles: `
		.page {
			background: #0a0a0a;
			color: #fff;
		}
		.hero {
			background: linear-gradient(180deg, rgba(220, 53, 69, 0.16), transparent);
		}
		.bg-dark-subtle-card {
			background: #161616;
			border-color: #2a2a2a;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteWebComponent {
	plans = PRICING_PLANS;
}
