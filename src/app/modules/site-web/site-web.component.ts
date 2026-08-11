import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavBarInitComponent } from '../../shared/nav-bar-init/nav-bar-init.component';
import { PRICING_PLANS, PricingPlan } from '../../shared/pricing-plans';

@Component({
	selector: 'app-site-web',
	standalone: true,
	imports: [NavBarInitComponent, RouterLink],
	template: `
		<app-nav-bar-init />
		<div class="page" data-bs-theme="dark">
			<div class="hero text-center py-2">
				<div class="container">
					<h1 class="display-6 fw-bold mb-1">Gestioná tus eventos de manera eficiente</h1>
					<p class="lead small mb-2" style="color: #b9b9b9;">Mapa de asientos, QR de entrada, portal público de auto-registro y cobro online — todo en un solo lugar.</p>
					<div class="d-flex justify-content-center gap-2 flex-wrap">
						<a routerLink="/signup" class="btn btn-danger px-4">Empezar ahora</a>
						<a routerLink="/evento-unico" class="btn btn-outline-light px-4">Gestionar sin Suscripción</a>
					</div>
				</div>
			</div>

			<div class="container pt-2 pb-3">
				<h2 class="text-center mb-2 h4">Planes</h2>
				<div class="row g-2 justify-content-center">
					@for (plan of plans; track plan.code) {
						<div class="col-12 col-md-6 col-lg-3">
							<div
								class="card h-100 bg-dark-subtle-card plan-card"
								[class.border-danger]="plan.highlighted"
								role="button"
								tabindex="0"
								[attr.aria-label]="'Ver detalle de ' + plan.name"
								(click)="selectedPlan.set(plan)"
								(keydown.enter)="selectedPlan.set(plan)"
								data-bs-toggle="modal"
								data-bs-target="#planDetailModal"
							>
								<div class="card-body d-flex flex-column py-2">
									<div class="d-flex justify-content-between align-items-start">
										<h3 class="h5 mb-0">{{ plan.name }}</h3>
										@if (plan.highlighted) {
											<span class="badge text-bg-danger ms-2">Más elegido</span>
										}
									</div>
									@if (plan.code === 'PRO_MAX') {
										<p class="mb-0 mt-1"><span class="fs-4 fw-bold">A cotizar</span></p>
									} @else {
										<p class="mb-0 mt-1"><span class="fs-4 fw-bold">USD {{ plan.priceUSD }}</span><span style="color: #b9b9b9;">/mes</span></p>
									}
									<p class="small mb-0 flex-grow-1" style="color: #b9b9b9;">Hasta {{ plan.attendeesPerEvent }} asistentes por evento</p>
									<span class="small text-danger mt-1">Ver detalle <i class="bi bi-arrow-right"></i></span>
								</div>
							</div>
						</div>
					}
				</div>
			</div>
		</div>

		<div class="modal fade" id="planDetailModal" tabindex="-1" aria-labelledby="planDetailModalLabel" aria-hidden="true" data-bs-theme="dark">
			<div class="modal-dialog modal-dialog-centered">
				<div class="modal-content bg-dark-subtle-card">
					@if (selectedPlan(); as plan) {
						<div class="modal-header border-secondary-subtle">
							<h3 class="modal-title h5" id="planDetailModalLabel">
								{{ plan.name }}
								@if (plan.highlighted) {
									<span class="badge text-bg-danger ms-2">Más elegido</span>
								}
							</h3>
							<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
						</div>
						<div class="modal-body">
							@if (plan.code === 'PRO_MAX') {
								<p class="mb-1"><span class="fs-3 fw-bold">A cotizar</span></p>
							} @else {
								<p class="mb-1"><span class="fs-3 fw-bold">USD {{ plan.priceUSD }}</span><span style="color: #b9b9b9;">/mes</span></p>
							}
							<p class="small mb-3" style="color: #b9b9b9;">Hasta {{ plan.attendeesPerEvent }} asistentes por evento</p>
							<p style="color: #d0d0d0;">{{ plan.description }}</p>
							<ul class="list-unstyled small">
								@for (feature of plan.features; track feature) {
									<li class="mb-2"><i class="bi bi-check2 text-danger"></i> {{ feature }}</li>
								}
							</ul>
						</div>
						<div class="modal-footer border-secondary-subtle">
							@if (plan.code === 'PRO_MAX') {
								<p class="small text-center mb-0 w-100" style="color: #b9b9b9;">
									Este plan lo activa nuestro equipo a medida, después de cotizar tu caso — no tiene alta automática.
								</p>
							} @else {
								<a [routerLink]="['/signup']" [queryParams]="{ plan: plan.code }" class="btn btn-danger w-100" data-bs-dismiss="modal">Comenzar con {{ plan.name }}</a>
							}
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
		.plan-card {
			cursor: pointer;
			transition: border-color 0.15s ease;
		}
		.plan-card:hover {
			border-color: #dc3545;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteWebComponent {
	plans = PRICING_PLANS;
	selectedPlan = signal<PricingPlan | null>(null);
}
