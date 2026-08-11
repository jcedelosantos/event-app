import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SignupEventService } from './services/signup-event.service';
import { EVENT_PLANS, EVENT_OVERAGE_FEE_PER_PERSON_USD, EventPlanCode } from '../../shared/event-plans';
import { extractErrorMessage } from '../../utils/api-error';

@Component({
	selector: 'app-signup-event',
	standalone: true,
	imports: [ReactiveFormsModule, RouterLink],
	template: `
		<div class="page" data-bs-theme="dark">
			<div class="container py-5" style="max-width: 640px;">
				@switch (step()) {
					@case ('form') {
						<h1 class="h3 mb-1">Tu evento, sin suscripción</h1>
						<p class="mb-4" style="color: #b9b9b9;">
							Pagás una sola vez, montás y corrés tu evento con acceso completo. Después del evento tu cuenta queda en modo de
							consulta — podés actualizarte a un plan recurrente cuando quieras. Si vendés más asistentes de los que pagaste acá,
							no te bloqueamos la venta — se factura aparte a USD {{ overageFee }} por persona adicional.
						</p>

						<form [formGroup]="form" (ngSubmit)="submit()" class="row g-3">
							<div class="col-12">
								<label class="form-label small">Tamaño del evento</label>
								<div class="row g-2">
									@for (tier of tiers; track tier.code) {
										<div class="col-6 col-md-4">
											<button
												type="button"
												class="btn w-100 h-100 text-start tier-btn"
												[class.btn-danger]="form.controls.eventPlanCode.value === tier.code"
												[class.btn-outline-secondary]="form.controls.eventPlanCode.value !== tier.code"
												(click)="form.controls.eventPlanCode.setValue(tier.code)"
											>
												<div class="fw-semibold">{{ tier.name }}</div>
												<div class="small">USD {{ tier.priceUSD }} — pago único</div>
											</button>
										</div>
									}
								</div>
							</div>

							<div class="col-12"><hr /></div>

							<div class="col-md-8">
								<label class="form-label small">Nombre de tu organización</label>
								<input type="text" class="form-control" formControlName="orgName" placeholder="Ej. Fiesta de fin de año" />
							</div>
							<div class="col-md-4">
								<label class="form-label small">Tipo</label>
								<select class="form-select" formControlName="orgType">
									<option value="GENERAL">General</option>
									<option value="CLUB">Club</option>
									<option value="CHURCH">Iglesia</option>
								</select>
							</div>

							<div class="col-12"><hr /></div>

							<div class="col-md-6">
								<label class="form-label small">Tu nombre</label>
								<input type="text" class="form-control" formControlName="adminName" />
							</div>
							<div class="col-md-6">
								<label class="form-label small">Tu apellido</label>
								<input type="text" class="form-control" formControlName="adminLastname" />
							</div>
							<div class="col-md-6">
								<label class="form-label small">Email</label>
								<input type="email" class="form-control" formControlName="adminEmail" />
							</div>
							<div class="col-md-6">
								<label class="form-label small">Usuario para iniciar sesión</label>
								<input type="text" class="form-control" formControlName="adminUsername" />
							</div>
							<div class="col-md-6">
								<label class="form-label small">Contraseña</label>
								<input type="password" class="form-control" formControlName="adminPassword" />
							</div>

							@if (errorMessage()) {
								<div class="col-12"><div class="alert alert-danger mb-0">{{ errorMessage() }}</div></div>
							}

							<div class="col-12 d-flex align-items-center gap-3">
								<button type="submit" class="btn btn-danger" [disabled]="submitting()">
									@if (submitting()) {
										Creando cuenta...
									} @else {
										Continuar al pago
									}
								</button>
								<a routerLink="/site-web" class="small" style="color: #b9b9b9;">Cancelar</a>
							</div>
						</form>
					}
					@case ('payment') {
						<h1 class="h3 mb-1">Confirmá el pago</h1>
						<p class="mb-4" style="color: #b9b9b9;">
							Pago único de <strong>USD {{ selectedTierPrice() }}</strong> — tu cuenta se activa apenas PayPal confirme.
						</p>
						<div id="paypal-button-container"></div>
						@if (errorMessage()) {
							<div class="alert alert-danger mt-3 mb-0">{{ errorMessage() }}</div>
						}
					}
					@case ('done') {
						<h1 class="h4 text-success">¡Tu cuenta está lista!</h1>
						<p class="mb-4" style="color: #b9b9b9;">El pago quedó confirmado. Ya podés iniciar sesión y crear tu evento.</p>
						<a routerLink="/login/sign-in" class="btn btn-danger">Iniciar sesión</a>
					}
				}
			</div>
		</div>
	`,
	styles: `
		.page {
			min-height: 100vh;
			background: #0a0a0a;
			color: #fff;
		}
		.tier-btn {
			min-height: 64px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupEventComponent {
	private readonly fb = inject(FormBuilder);
	private readonly signupEventService = inject(SignupEventService);

	tiers = EVENT_PLANS;
	overageFee = EVENT_OVERAGE_FEE_PER_PERSON_USD;
	step = signal<'form' | 'payment' | 'done'>('form');
	submitting = signal(false);
	errorMessage = signal('');

	private tenantId: number | null = null;
	private orderId: string | null = null;
	private paypalButtonsRendered = false;

	form = this.fb.group({
		eventPlanCode: this.fb.control<EventPlanCode>('EVENT_100', Validators.required),
		orgName: this.fb.control('', Validators.required),
		orgType: this.fb.control<'GENERAL' | 'CLUB' | 'CHURCH'>('GENERAL', Validators.required),
		adminName: this.fb.control('', Validators.required),
		adminLastname: this.fb.control('', Validators.required),
		adminEmail: this.fb.control('', [Validators.required, Validators.email]),
		adminUsername: this.fb.control('', [Validators.required, Validators.minLength(3)]),
		adminPassword: this.fb.control('', [Validators.required, Validators.minLength(4)]),
	});

	selectedTierPrice(): number {
		return this.tiers.find((t) => t.code === this.form.controls.eventPlanCode.value)?.priceUSD ?? 0;
	}

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}
		this.errorMessage.set('');
		this.submitting.set(true);
		const { eventPlanCode, orgName, orgType, adminName, adminLastname, adminEmail, adminUsername, adminPassword } = this.form.getRawValue();

		this.signupEventService
			.signup({
				organization: { name: orgName!, type: orgType! },
				admin: { username: adminUsername!, password: adminPassword!, name: adminName!, lastname: adminLastname!, email: adminEmail! },
				eventPlanCode: eventPlanCode!,
			})
			.subscribe({
				next: (result) => {
					this.tenantId = result.tenantId;
					this.orderId = result.orderId;
					this.submitting.set(false);
					this.step.set('payment');
					this.ensurePaypalButtons();
				},
				error: (err: HttpErrorResponse) => {
					this.submitting.set(false);
					this.errorMessage.set(extractErrorMessage(err));
				},
			});
	}

	// Mismo mecanismo de carga del SDK que public-event.component.ts (ensurePaypalButtons) — acá el
	// orden ya está creado (ver submit()), así que createOrder devuelve el mismo orderId en vez de
	// pedir uno nuevo.
	private ensurePaypalButtons() {
		if (this.paypalButtonsRendered) return;
		this.paypalButtonsRendered = true;

		const render = () => {
			const paypal = (window as any).paypal;
			if (!paypal) return;
			paypal
				.Buttons({
					createOrder: async () => this.orderId!,
					onApprove: async () => {
						try {
							await firstValueFrom(this.signupEventService.capture(this.tenantId!, this.orderId!));
							this.step.set('done');
						} catch (err) {
							this.errorMessage.set(extractErrorMessage(err as HttpErrorResponse));
						}
					},
					onError: (err: unknown) => {
						console.error('Error de PayPal:', err);
						if (!this.errorMessage()) {
							this.errorMessage.set('Hubo un problema con PayPal — intentá de nuevo.');
						}
					},
				})
				.render('#paypal-button-container');
		};

		if ((window as any).paypal) {
			render();
			return;
		}
		const existing = document.getElementById('paypal-sdk-script');
		if (existing) {
			existing.addEventListener('load', render, { once: true });
			return;
		}

		firstValueFrom(this.signupEventService.getPaypalClientId())
			.then(({ clientId }) => {
				const script = document.createElement('script');
				script.id = 'paypal-sdk-script';
				script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD`;
				script.addEventListener('load', render, { once: true });
				document.body.appendChild(script);
			})
			.catch(() => this.errorMessage.set('No se pudo cargar PayPal — intentá de nuevo en un momento.'));
	}
}
