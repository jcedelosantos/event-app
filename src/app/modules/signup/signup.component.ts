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
			<div class="container py-5" style="max-width: 640px;">
				@switch (step()) {
					@case ('form') {
						<h1 class="h3 mb-1">Creá tu cuenta</h1>
						<p class="mb-4" style="color: #b9b9b9;">Tu organización queda activa apenas confirmes el pago.</p>

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

							<div class="col-12">
								<label class="form-label small">Método de pago</label>
								<div class="d-flex gap-2">
									<button
										type="button"
										class="btn flex-fill"
										[class.btn-danger]="form.controls.paymentMethod.value === 'PAYPAL'"
										[class.btn-outline-secondary]="form.controls.paymentMethod.value !== 'PAYPAL'"
										(click)="form.controls.paymentMethod.setValue('PAYPAL')"
									>
										PayPal
									</button>
									<button
										type="button"
										class="btn flex-fill"
										[class.btn-danger]="form.controls.paymentMethod.value === 'BANK_TRANSFER'"
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

							@if (errorMessage()) {
								<div class="col-12"><div class="alert alert-danger mb-0">{{ errorMessage() }}</div></div>
							}

							<div class="col-12 d-flex align-items-center gap-3">
								<button type="submit" class="btn btn-danger" [disabled]="submitting()">
									@if (submitting()) {
										Creando cuenta...
									} @else if (form.controls.paymentMethod.value === 'BANK_TRANSFER') {
										Continuar
									} @else {
										Continuar a PayPal
									}
								</button>
								<a routerLink="/site-web" class="small" style="color: #b9b9b9;">Cancelar</a>
							</div>
						</form>
						<div class="mt-3">
							<a routerLink="/evento-unico" class="small" style="color: #b9b9b9;">Gestionar sin Suscripción</a>
						</div>
					}
					@case ('bank-transfer') {
						<h1 class="h3 mb-1">Transferí y subí tu comprobante</h1>
						<p class="mb-1" style="color: #b9b9b9;">
							Primer mes: <strong>USD {{ selectedPlanPrice() }}</strong>. Transferí a esta cuenta y subí una foto del comprobante —
							activamos tu cuenta apenas lo confirmemos.
						</p>
						@if (dopAmount(); as dop) {
							<p class="mb-4 small" style="color: #b9b9b9;">
								≈ RD$ {{ dop.amount | number: '1.0-0' }} al tipo de cambio de hoy (1 USD = RD$ {{ dop.rate | number: '1.2-2' }})
							</p>
						} @else {
							<div class="mb-4"></div>
						}

						@if (bankInfo(); as bank) {
							<div class="card bg-dark border-secondary mb-4">
								<div class="card-body">
									<dl class="row mb-0 small">
										<dt class="col-5" style="color: #b9b9b9;">Banco</dt>
										<dd class="col-7">{{ bank.bankName }}</dd>
										<dt class="col-5" style="color: #b9b9b9;">Tipo de cuenta</dt>
										<dd class="col-7">{{ bank.bankAccountType }}</dd>
										<dt class="col-5" style="color: #b9b9b9;">Número de cuenta</dt>
										<dd class="col-7">{{ bank.bankAccountNumber }}</dd>
										<dt class="col-5" style="color: #b9b9b9;">Titular</dt>
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

						<button type="button" class="btn btn-danger" [disabled]="!selectedFile() || uploadingReceipt()" (click)="submitReceipt()">
							@if (uploadingReceipt()) {
								Subiendo...
							} @else {
								Ya transferí, subir comprobante
							}
						</button>
					}
					@case ('pending-review') {
						<h1 class="h4 text-info">Recibimos tu comprobante</h1>
						<p class="mb-4" style="color: #b9b9b9;">
							Te confirmamos por correo apenas lo validemos — no hace falta que hagas nada más por ahora.
						</p>
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
			error: () => this.errorMessage.set('No se pudieron cargar los datos de la cuenta — recargá la página.'),
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
