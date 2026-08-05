import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SignupService } from './services/signup.service';
import { PRICING_PLANS, PlanCode } from '../../shared/pricing-plans';

@Component({
	selector: 'app-signup',
	standalone: true,
	imports: [ReactiveFormsModule, RouterLink],
	template: `
		<div class="page" data-bs-theme="dark">
			<div class="container py-5" style="max-width: 640px;">
				<h1 class="h3 mb-1">Creá tu cuenta</h1>
				<p class="mb-4" style="color: #b9b9b9;">Tu organización queda activa apenas confirmes el pago en PayPal.</p>

				<form [formGroup]="form" (ngSubmit)="submit()" class="row g-3">
					<div class="col-12">
						<label class="form-label small">Plan</label>
						<select class="form-select" formControlName="plan">
							@for (plan of plans; track plan.code) {
								<option [value]="plan.code">{{ plan.name }} — \${{ plan.priceUSD }}/mes (hasta {{ plan.attendeesPerEvent }} asistentes por evento)</option>
							}
						</select>
					</div>

					<div class="col-12"><hr /></div>

					<div class="col-md-8">
						<label class="form-label small">Nombre de tu organización</label>
						<input type="text" class="form-control" formControlName="orgName" placeholder="Ej. Club Deportivo Naco" />
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
								Continuar a PayPal
							}
						</button>
						<a routerLink="/site-web" class="small" style="color: #b9b9b9;">Cancelar</a>
					</div>
				</form>
			</div>
		</div>
	`,
	styles: `
		.page {
			min-height: 100vh;
			background: #0a0a0a;
			color: #fff;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
	private readonly fb = inject(FormBuilder);
	private readonly signupService = inject(SignupService);
	private readonly route = inject(ActivatedRoute);

	plans = PRICING_PLANS;
	submitting = signal(false);
	errorMessage = signal('');

	form = this.fb.group({
		plan: this.fb.control<PlanCode>('INTERMEDIO', Validators.required),
		orgName: this.fb.control('', Validators.required),
		orgType: this.fb.control<'GENERAL' | 'CLUB' | 'CHURCH'>('GENERAL', Validators.required),
		adminName: this.fb.control('', Validators.required),
		adminLastname: this.fb.control('', Validators.required),
		adminEmail: this.fb.control('', [Validators.required, Validators.email]),
		adminUsername: this.fb.control('', [Validators.required, Validators.minLength(3)]),
		adminPassword: this.fb.control('', [Validators.required, Validators.minLength(4)]),
	});

	constructor() {
		// Llega precargado desde el CTA de un plan puntual en la portada (ver site-web.component.ts) —
		// si no viene, se queda con el default del form (Intermedio).
		const queryPlan = this.route.snapshot.queryParamMap.get('plan');
		if (queryPlan && this.plans.some((p) => p.code === queryPlan)) {
			this.form.controls.plan.setValue(queryPlan as PlanCode);
		}
	}

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}
		this.errorMessage.set('');
		this.submitting.set(true);
		const { plan, orgName, orgType, adminName, adminLastname, adminEmail, adminUsername, adminPassword } = this.form.getRawValue();

		this.signupService
			.signup({
				organization: { name: orgName!, type: orgType! },
				admin: { username: adminUsername!, password: adminPassword!, name: adminName!, lastname: adminLastname!, email: adminEmail! },
				plan: plan!,
			})
			.subscribe({
				next: (result) => {
					// Redirect completo (no routerLink): approveUrl es la página de PayPal, fuera de esta app.
					window.location.href = result.approveUrl;
				},
				error: (err) => {
					this.submitting.set(false);
					this.errorMessage.set(err?.error?.error ?? 'No se pudo crear la cuenta. Intentá de nuevo.');
				},
			});
	}
}
