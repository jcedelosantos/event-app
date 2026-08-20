import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { SignupService, BankInfo } from './services/signup.service';
import { PRICING_PLANS, PlanCode } from '../../shared/pricing-plans';
import { extractErrorMessage } from '../../utils/api-error';
import { centsToDollars } from '../../shared/money';

type Step = 'form' | 'bank-transfer' | 'pending-review';

@Component({
	selector: 'app-signup',
	standalone: true,
	imports: [ReactiveFormsModule, RouterLink, DecimalPipe],
	template: `
		<div class="page" data-bs-theme="dark">
			<div class="auth-card">
				<span class="brand-mark">INTEG</span>
				@switch (step()) {
					@case ('form') {
						<h1 class="h3 mb-1">Creá tu cuenta</h1>
						<p class="mb-4" style="color: #a3a3a3;">Tu organización queda activa apenas confirmes el pago.</p>

						<form [formGroup]="form" (ngSubmit)="submit()" class="row g-3">
							<div class="col-12">
								<label class="form-label small">Plan</label>
								<select class="form-select" formControlName="plan">
									@for (plan of plans; track plan.code) {
										<option [value]="plan.code">{{ plan.name }} — USD {{ centsToDollars(plan.priceCents) }}/mes (hasta {{ plan.attendeesPerEvent }} asistentes por evento)</option>
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
									<option value="ONG">ONG</option>
									<option value="PRIVADA">Empresa privada</option>
									<option value="PUBLICA">Institución pública</option>
									<option value="INDEPENDIENTE">Independiente</option>
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

							<div class="col-12"><hr /></div>

							<div class="col-12">
								<label class="form-label small">Método de pago</label>
								<div class="d-flex gap-2">
									<button
										type="button"
										class="btn flex-fill"
										[class.btn-brand]="form.controls.paymentMethod.value === 'PAYPAL'"
										[class.btn-outline-secondary]="form.controls.paymentMethod.value !== 'PAYPAL'"
										(click)="form.controls.paymentMethod.setValue('PAYPAL')"
									>
										PayPal
									</button>
									<button
										type="button"
										class="btn flex-fill"
										[class.btn-brand]="form.controls.paymentMethod.value === 'BANK_TRANSFER'"
										[class.btn-outline-secondary]="form.controls.paymentMethod.value !== 'BANK_TRANSFER'"
										(click)="form.controls.paymentMethod.setValue('BANK_TRANSFER')"
									>
										Transferencia bancaria
									</button>
								</div>
								@if (form.controls.paymentMethod.value === 'BANK_TRANSFER') {
									<div class="form-text">
										Con transferencia, tu cuenta queda activa una vez que confirmemos el pago a mano — no es automático como PayPal. Las
										renovaciones mensuales siguientes también se coordinan por transferencia.
									</div>
								}
							</div>

							@if (errorMessage()) {
								<div class="col-12"><div class="alert alert-danger mb-0">{{ errorMessage() }}</div></div>
							}

							<div class="col-12 d-flex align-items-center gap-3">
								<button type="submit" class="btn btn-brand" [disabled]="submitting()">
									@if (submitting()) {
										Creando cuenta...
									} @else if (form.controls.paymentMethod.value === 'BANK_TRANSFER') {
										Continuar
									} @else {
										Continuar a PayPal
									}
								</button>
								<a routerLink="/site-web" class="small" style="color: #a3a3a3;">Cancelar</a>
							</div>
						</form>
						<div class="mt-3">
							<a routerLink="/evento-unico" class="small" style="color: #a3a3a3;">Gestionar sin Suscripción</a>
						</div>
					}
					@case ('bank-transfer') {
						<h1 class="h3 mb-1">Transfiere y sube tu comprobante</h1>
						<p class="mb-1" style="color: #a3a3a3;">
							Primer mes: <strong>USD {{ selectedPlanPrice() }}</strong>. Transfiere a esta cuenta y sube una foto del comprobante —
							activamos tu cuenta apenas lo confirmemos.
						</p>
						@if (dopAmount(); as dop) {
							<p class="mb-4 small" style="color: #a3a3a3;">
								≈ RD$ {{ dop.amount | number: '1.0-0' }} al tipo de cambio de hoy (1 USD = RD$ {{ dop.rate | number: '1.2-2' }})
							</p>
						} @else {
							<div class="mb-4"></div>
						}

						@if (bankInfo(); as bank) {
							<div class="card bank-info-card mb-4">
								<div class="card-body">
									<dl class="row mb-0 small">
										<dt class="col-5" style="color: #a3a3a3;">Banco</dt>
										<dd class="col-7">{{ bank.bankName }}</dd>
										<dt class="col-5" style="color: #a3a3a3;">Tipo de cuenta</dt>
										<dd class="col-7">{{ bank.bankAccountType }}</dd>
										<dt class="col-5" style="color: #a3a3a3;">Número de cuenta</dt>
										<dd class="col-7">{{ bank.bankAccountNumber }}</dd>
										<dt class="col-5" style="color: #a3a3a3;">Titular</dt>
										<dd class="col-7 mb-0">{{ bank.bankAccountHolder }}</dd>
									</dl>
								</div>
							</div>
						} @else {
							<p class="text-body-secondary small">Cargando los datos de la cuenta...</p>
						}

						<div class="mb-3">
							<label class="form-label small">Foto del comprobante</label>
							<input type="file" class="form-control" accept="image/*" (change)="onReceiptFileSelected($event)" />
						</div>

						@if (errorMessage()) {
							<div class="alert alert-danger mb-3">{{ errorMessage() }}</div>
						}

						<button type="button" class="btn btn-brand" [disabled]="!selectedFile() || uploadingReceipt()" (click)="submitReceipt()">
							@if (uploadingReceipt()) {
								Subiendo...
							} @else {
								Ya transfiere, subir comprobante
							}
						</button>
					}
					@case ('pending-review') {
						<h1 class="h4 text-info">Recibimos tu comprobante</h1>
						<p class="mb-4" style="color: #a3a3a3;">
							Te confirmamos por correo apenas lo validemos — no hace falta que hagas nada más por ahora.
						</p>
					}
				}
			</div>
		</div>
	`,
	styles: `
		/* Misma línea visual que el login (ver layout-page/sign-in en src/app/modules/login) — fondo
		   con degradado azul de marca + tarjeta centrada, en vez del formulario suelto de antes. */
		.page {
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 2rem 1rem;
			background:
				radial-gradient(circle at 50% -10%, rgba(30, 58, 138, 0.28), transparent 55%),
				#0a0a0a;
			color: #fff;
		}
		.auth-card {
			width: 100%;
			max-width: 640px;
			background: #161616;
			border: 1px solid #2a2a2a;
			border-radius: 0.75rem;
			padding: 2.25rem 2rem;
			box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.6);
		}
		.brand-mark {
			display: block;
			text-align: center;
			font-weight: 700;
			font-size: 0.95rem;
			letter-spacing: 0.16em;
			color: #6f8ad6;
			margin-bottom: 1.25rem;
		}
		.form-label {
			color: #c9c9c9;
		}
		.form-control,
		.form-select {
			background-color: #0f0f0f;
			border-color: #333;
			color: #f5f5f5;
		}
		.form-control:focus,
		.form-select:focus {
			background-color: #0f0f0f;
			border-color: #34509e;
			color: #fff;
			box-shadow: 0 0 0 0.2rem rgba(30, 58, 138, 0.35);
		}
		.bank-info-card {
			background: #0f0f0f;
			border-color: #333;
		}
		.btn-brand {
			background: #1e3a8a;
			border-color: #1e3a8a;
			color: #fff;
			font-weight: 600;
		}
		.btn-brand:hover,
		.btn-brand:focus {
			background: #19316f;
			border-color: #19316f;
			color: #fff;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
	private readonly fb = inject(FormBuilder);
	private readonly signupService = inject(SignupService);
	private readonly route = inject(ActivatedRoute);
	readonly centsToDollars = centsToDollars;

	// Pro Enterprise no es autoservicio (ver PRICING_PLANS/pricing-plans.ts) — el backend igual lo
	// rechaza si llegara a mandarse, esto evita que aparezca como opción en primer lugar.
	plans = PRICING_PLANS.filter((p) => p.code !== 'PRO_MAX');
	step = signal<Step>('form');
	submitting = signal(false);
	errorMessage = signal('');

	bankInfo = signal<BankInfo | null>(null);
	selectedFile = signal<File | null>(null);
	uploadingReceipt = signal(false);

	private tenantId: number | null = null;

	form = this.fb.group({
		plan: this.fb.control<PlanCode>('INTERMEDIO', Validators.required),
		paymentMethod: this.fb.control<'PAYPAL' | 'BANK_TRANSFER'>('PAYPAL', Validators.required),
		orgName: this.fb.control('', Validators.required),
		orgType: this.fb.control<'GENERAL' | 'CLUB' | 'CHURCH' | 'ONG' | 'PRIVADA' | 'PUBLICA' | 'INDEPENDIENTE'>('GENERAL', Validators.required),
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

	// Devuelve dólares (no centavos) — se usa directo en el template y para el equivalente en pesos.
	selectedPlanPrice(): number {
		return centsToDollars(this.plans.find((p) => p.code === this.form.controls.plan.value)?.priceCents ?? 0);
	}

	dopAmount = computed(() => {
		const rate = this.bankInfo()?.usdToDopRate;
		if (!rate) return null;
		return { rate, amount: this.selectedPlanPrice() * rate };
	});

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}
		this.errorMessage.set('');
		this.submitting.set(true);
		const { plan, paymentMethod, orgName, orgType, adminName, adminLastname, adminEmail, adminUsername, adminPassword } = this.form.getRawValue();

		this.signupService
			.signup({
				organization: { name: orgName!, type: orgType! },
				admin: { username: adminUsername!, password: adminPassword!, name: adminName!, lastname: adminLastname!, email: adminEmail! },
				plan: plan!,
				paymentMethod: paymentMethod!,
			})
			.subscribe({
				next: (result) => {
					this.tenantId = result.tenantId;
					if (paymentMethod === 'BANK_TRANSFER') {
						this.submitting.set(false);
						this.step.set('bank-transfer');
						this.loadBankInfo();
						return;
					}
					// Redirect completo (no routerLink): approveUrl es la página de PayPal, fuera de esta app.
					window.location.href = result.approveUrl!;
				},
				error: (err: HttpErrorResponse) => {
					this.submitting.set(false);
					this.errorMessage.set(extractErrorMessage(err));
				},
			});
	}

	private loadBankInfo() {
		this.signupService.getBankInfo().subscribe({
			next: (bank) => this.bankInfo.set(bank),
			error: () => this.errorMessage.set('No se pudieron cargar los datos de la cuenta — recarga la página.'),
		});
	}

	onReceiptFileSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		this.selectedFile.set(input.files?.[0] ?? null);
	}

	submitReceipt() {
		const file = this.selectedFile();
		if (!file || !this.tenantId) return;

		this.errorMessage.set('');
		this.uploadingReceipt.set(true);
		this.signupService.uploadReceipt(file).subscribe({
			next: ({ url }) => {
				this.signupService.submitReceipt(this.tenantId!, url).subscribe({
					next: () => {
						this.uploadingReceipt.set(false);
						this.step.set('pending-review');
					},
					error: (err: HttpErrorResponse) => {
						this.uploadingReceipt.set(false);
						this.errorMessage.set(extractErrorMessage(err));
					},
				});
			},
			error: (err: HttpErrorResponse) => {
				this.uploadingReceipt.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}
}
