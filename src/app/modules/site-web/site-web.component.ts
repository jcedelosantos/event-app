import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from 'bootstrap';
import { NavBarInitComponent } from '../../shared/nav-bar-init/nav-bar-init.component';
import { PRICING_PLANS, PricingPlan } from '../../shared/pricing-plans';
import { EnterpriseLeadService } from './services/enterprise-lead.service';
import { extractErrorMessage } from '../../utils/api-error';
import { centsToDollars } from '../../shared/money';

type LeadFormState = 'closed' | 'open' | 'success';

@Component({
	selector: 'app-site-web',
	standalone: true,
	imports: [NavBarInitComponent, RouterLink, FormsModule],
	template: `
		<app-nav-bar-init />
		<div class="page" data-bs-theme="dark">
			<div class="hero text-center py-2">
				<div class="container">
					<h1 class="display-6 fw-bold mb-1">Gestioná tus eventos de manera eficiente</h1>
					<p class="lead small mb-2" style="color: #b9b9b9;">Mapa de asientos, QR de entrada, portal público de auto-registro y cobro online — todo en un solo lugar.</p>
					<a routerLink="/signup" class="btn btn-danger px-4">Empezar ahora</a>
				</div>
			</div>

			<div class="container pt-2 pb-3">
				<h2 class="text-center mb-2 h4">Planes</h2>
				<div class="row g-2 justify-content-center">
					<div class="col-12 col-md-6 col-lg-3">
						<a routerLink="/evento-unico" class="card h-100 bg-dark-subtle-card plan-card text-decoration-none text-white d-block">
							<div class="card-body d-flex flex-column py-2">
								<div class="d-flex justify-content-between align-items-start">
									<h3 class="h5 mb-0">Sin Suscripción</h3>
								</div>
								<p class="mb-0 mt-1"><span class="fs-4 fw-bold">Pago único</span></p>
								<p class="small mb-0 flex-grow-1" style="color: #b9b9b9;">Para un evento suelto, sin mensualidad — desde 100 hasta 5,000 asistentes.</p>
								<span class="small text-danger mt-1">Ver planes <i class="bi bi-arrow-right"></i></span>
							</div>
						</a>
					</div>
					@for (plan of plans; track plan.code) {
						<div class="col-12 col-md-6 col-lg-3">
							<div
								class="card h-100 bg-dark-subtle-card plan-card"
								[class.border-danger]="plan.highlighted"
								role="button"
								tabindex="0"
								[attr.aria-label]="plan.code === 'PRO_MAX' ? 'Pedir cotización de ' + plan.name : 'Comenzar con ' + plan.name"
								(click)="selectPlan(plan)"
								(keydown.enter)="selectPlan(plan)"
							>
								<div class="card-body d-flex flex-column py-2">
									<div class="d-flex justify-content-between align-items-start">
										<h3 class="h5 mb-0">{{ plan.name }}</h3>
										@if (plan.highlighted) {
											<span class="badge text-bg-danger ms-2">Más elegido</span>
										}
									</div>
									@if (plan.code === 'PRO_MAX') {
										<p class="mb-0 mt-1"><span class="fs-4 fw-bold">Integrado a tu Medida</span></p>
									} @else {
										<p class="mb-0 mt-1"><span class="fs-4 fw-bold">USD {{ centsToDollars(plan.priceCents) }}</span><span style="color: #b9b9b9;">/mes</span></p>
									}
									<p class="small mb-0 flex-grow-1" style="color: #b9b9b9;">Hasta {{ plan.attendeesPerEvent }} asistentes por evento</p>
									<button
										type="button"
										class="btn btn-link btn-sm text-danger p-0 text-start mt-1 align-self-start"
										data-bs-toggle="modal"
										data-bs-target="#planDetailModal"
										(click)="$event.stopPropagation(); openPlan(plan)"
									>
										Ver detalle <i class="bi bi-arrow-right"></i>
									</button>
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

						@if (plan.code === 'PRO_MAX' && leadFormState() !== 'closed') {
							<div class="modal-body">
								@if (leadFormState() === 'open') {
									<p style="color: #d0d0d0;">Dejanos tus datos y te contactamos para armar tu plan a medida.</p>
									<div class="mb-2">
										<label class="form-label small">Organización *</label>
										<input type="text" class="form-control" [(ngModel)]="leadForm.orgName" name="orgName" />
									</div>
									<div class="mb-2">
										<label class="form-label small">Tu nombre *</label>
										<input type="text" class="form-control" [(ngModel)]="leadForm.contactName" name="contactName" />
									</div>
									<div class="mb-2">
										<label class="form-label small">Email *</label>
										<input type="email" class="form-control" [(ngModel)]="leadForm.email" name="email" />
									</div>
									<div class="mb-2">
										<label class="form-label small">Teléfono</label>
										<input type="tel" class="form-control" [(ngModel)]="leadForm.phone" name="phone" />
									</div>
									<div class="mb-2">
										<label class="form-label small">Contanos tu caso</label>
										<textarea class="form-control" rows="2" [(ngModel)]="leadForm.message" name="message"></textarea>
									</div>
									@if (leadError()) {
										<div class="alert alert-danger py-2 small mb-0">{{ leadError() }}</div>
									}
								} @else {
									<p class="text-success mb-0"><i class="bi bi-check-circle"></i> ¡Listo! Recibimos tus datos, te contactamos a la brevedad.</p>
								}
							</div>
							<div class="modal-footer border-secondary-subtle">
								@if (leadFormState() === 'open') {
									<button type="button" class="btn btn-outline-light" (click)="leadFormState.set('closed')" [disabled]="leadSubmitting()">Volver</button>
									<button type="button" class="btn btn-danger" (click)="submitLead()" [disabled]="leadSubmitting() || !leadForm.orgName || !leadForm.contactName || !leadForm.email">
										@if (leadSubmitting()) {
											Enviando...
										} @else {
											Enviar
										}
									</button>
								} @else {
									<button type="button" class="btn btn-danger w-100" data-bs-dismiss="modal">Cerrar</button>
								}
							</div>
						} @else {
							<div class="modal-body">
								@if (plan.code === 'PRO_MAX') {
									<p class="mb-1"><span class="fs-3 fw-bold">Integrado a tu Medida</span></p>
								} @else {
									<p class="mb-1"><span class="fs-3 fw-bold">USD {{ centsToDollars(plan.priceCents) }}</span><span style="color: #b9b9b9;">/mes</span></p>
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
									<button type="button" class="btn btn-danger w-100" (click)="leadFormState.set('open')">Quiero que me contacten</button>
								} @else {
									<a [routerLink]="['/signup']" [queryParams]="{ plan: plan.code }" class="btn btn-danger w-100" data-bs-dismiss="modal">Comenzar con {{ plan.name }}</a>
								}
							</div>
						}
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
export class SiteWebComponent implements OnInit {
	private readonly enterpriseLeadService = inject(EnterpriseLeadService);
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	readonly centsToDollars = centsToDollars;

	plans = PRICING_PLANS;
	selectedPlan = signal<PricingPlan | null>(null);

	leadFormState = signal<LeadFormState>('closed');
	leadSubmitting = signal(false);
	leadError = signal('');
	leadForm = { orgName: '', contactName: '', email: '', phone: '', message: '' };

	// Deep link directo al formulario de contacto de Enterprise (?plan=PRO_MAX) — mismo espíritu que
	// /signup?plan=CODE para los otros planes (ver create-event-modal... no, ver el link "Comenzar
	// con {{ plan.name }}" más abajo), pero acá el "checkout" es dejar los datos de contacto, no un
	// signup: sin esto, alguien que llega desde un link externo (ej. la guía comercial) tenía que
	// hacer 3 clicks (entrar al sitio, abrir la tarjeta de Pro Enterprise, tocar "Quiero que me
	// contacten") en vez de llegar directo al formulario abierto.
	ngOnInit(): void {
		if (this.route.snapshot.queryParamMap.get('plan') !== 'PRO_MAX') return;
		const proMax = this.plans.find((p) => p.code === 'PRO_MAX');
		if (!proMax) return;
		this.openLeadFormDirect(proMax);
	}

	openPlan(plan: PricingPlan) {
		this.selectedPlan.set(plan);
		this.leadFormState.set('closed');
		this.leadError.set('');
	}

	// Click en el cuerpo general de la tarjeta (no en "Ver detalle") — va directo a la acción, sin
	// pasar por el detalle. Para los planes de autoservicio eso es /signup con el plan ya elegido
	// (mismo checkout que "Comenzar con {{ plan.name }}" del modal); Pro Enterprise no tiene
	// checkout propio, así que "ir directo" es abrir el modal ya en el formulario de contacto.
	selectPlan(plan: PricingPlan) {
		if (plan.code === 'PRO_MAX') {
			this.openLeadFormDirect(plan);
			return;
		}
		this.router.navigate(['/signup'], { queryParams: { plan: plan.code } });
	}

	private openLeadFormDirect(plan: PricingPlan) {
		this.openPlan(plan);
		this.leadFormState.set('open');
		queueMicrotask(() => bootstrap.Modal.getOrCreateInstance('#planDetailModal').show());
	}

	submitLead() {
		if (!this.leadForm.orgName || !this.leadForm.contactName || !this.leadForm.email) return;
		this.leadSubmitting.set(true);
		this.leadError.set('');
		this.enterpriseLeadService.submit({ ...this.leadForm }).subscribe({
			next: () => {
				this.leadSubmitting.set(false);
				this.leadFormState.set('success');
				this.leadForm = { orgName: '', contactName: '', email: '', phone: '', message: '' };
			},
			error: (err: HttpErrorResponse) => {
				this.leadSubmitting.set(false);
				this.leadError.set(extractErrorMessage(err));
			},
		});
	}
}
