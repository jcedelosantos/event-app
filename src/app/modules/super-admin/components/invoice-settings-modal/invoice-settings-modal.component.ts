import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PlatformSettingsService } from '../../services/platform-settings.service';
import { extractErrorMessage } from '../../../../utils/api-error';
import { confirm, error as showError } from '../../../../utils/messages';
import { closeModal } from '../../../../utils/modal';
import { environment } from '../../../../../environments/environment';

// Datos del emisor (Cedanet Solutions), banco y secuencia de NCF que van en cada factura generada
// desde el modal de suscripción (ver invoice-pdf.ts en la API) — configuración global, no por
// tenant, por eso vive en su propio modal en vez de en el modal de edición de organización.
@Component({
	selector: 'app-invoice-settings-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="invoiceSettingsModal" tabindex="-1" aria-labelledby="invoiceSettingsModalLabel" aria-hidden="true">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="invoiceSettingsModalLabel">Configuración de facturación</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" (click)="onClose()"></button>
					</div>
					<div class="modal-body">
						@if (loading()) {
							<p class="text-muted">Cargando...</p>
						} @else {
							<form id="invoiceSettingsForm" (submit)="$event.preventDefault(); save()" [formGroup]="form">
								<p class="text-muted small">Datos del emisor — aparecen en el encabezado de cada factura.</p>
								<div class="d-flex align-items-center gap-3 mb-3">
									@if (logoUrl(); as logo) {
										<img [src]="logo" alt="" class="logo-preview" />
									} @else {
										<div class="logo-preview logo-preview-empty"><i class="bi bi-image" aria-hidden="true"></i></div>
									}
									<div class="flex-grow-1">
										<label for="issuerLogo" class="form-label small mb-1">Logo</label>
										<input type="file" accept="image/*" class="form-control form-control-sm" id="issuerLogo" (change)="onLogoSelected($event)" [disabled]="uploadingLogo()" />
										@if (uploadingLogo()) {
											<div class="form-text">Subiendo...</div>
										}
										@if (logoUrl()) {
											<button type="button" class="btn btn-link btn-sm p-0 mt-1" [disabled]="uploadingLogo()" (click)="removeLogo()">Quitar logo</button>
										}
										@if (logoError()) {
											<div class="text-danger small mt-1">{{ logoError() }}</div>
										}
									</div>
								</div>
								<div class="row g-2 mb-3">
									<div class="col-md-6">
										<label for="issuerName">Nombre / razón social</label>
										<input type="text" class="form-control" id="issuerName" formControlName="invoiceIssuerName" />
									</div>
									<div class="col-md-6">
										<label for="issuerRnc">RNC</label>
										<input type="text" class="form-control" id="issuerRnc" formControlName="invoiceIssuerRnc" />
									</div>
									<div class="col-md-6">
										<label for="issuerEmail">Email</label>
										<input type="text" class="form-control" id="issuerEmail" formControlName="invoiceIssuerEmail" />
									</div>
									<div class="col-md-6">
										<label for="issuerPhone">Teléfono</label>
										<input type="text" class="form-control" id="issuerPhone" formControlName="invoiceIssuerPhone" />
									</div>
									<div class="col-12">
										<label for="issuerAddress">Dirección</label>
										<input type="text" class="form-control" id="issuerAddress" formControlName="invoiceIssuerAddress" />
									</div>
								</div>

								<p class="text-muted small">Instrucción de pago — se muestra en cada factura.</p>
								<div class="row g-2 mb-3">
									<div class="col-md-6">
										<label for="bankName">Banco</label>
										<input type="text" class="form-control" id="bankName" formControlName="invoiceBankName" />
									</div>
									<div class="col-md-6">
										<label for="bankAccountType">Tipo de cuenta</label>
										<input type="text" class="form-control" id="bankAccountType" formControlName="invoiceBankAccountType" placeholder="Corriente / Ahorros" />
									</div>
									<div class="col-md-6">
										<label for="bankAccountNumber">Número de cuenta</label>
										<input type="text" class="form-control" id="bankAccountNumber" formControlName="invoiceBankAccountNumber" />
									</div>
									<div class="col-md-6">
										<label for="bankAccountHolder">Titular de la cuenta</label>
										<input type="text" class="form-control" id="bankAccountHolder" formControlName="invoiceBankAccountHolder" />
									</div>
								</div>

								<p class="text-muted small">
									NCF — secuencia autorizada por DGII. "Comprobante #" en la factura usa este valor y avanza en 1 cada vez que se genera una factura.
								</p>
								<div class="row g-2">
									<div class="col-md-4">
										<label for="ncfPrefix">Prefijo</label>
										<input type="text" class="form-control" id="ncfPrefix" formControlName="invoiceNcfPrefix" placeholder="B01" />
									</div>
									<div class="col-md-8">
										<label for="ncfNext">Próximo NCF (solo el número, sin el prefijo)</label>
										<input type="text" inputmode="numeric" class="form-control" id="ncfNext" formControlName="invoiceNcfNext" placeholder="Ej. 507" />
										<div class="form-text">
											Vacío = las facturas se generan sin NCF fiscal (solo con número de referencia interno de seat-app).
										</div>
									</div>
								</div>
							</form>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal" (click)="onClose()">Cerrar</button>
						<button type="submit" form="invoiceSettingsForm" class="btn btn-primary" [disabled]="loading() || saving()">
							{{ saving() ? 'Guardando...' : 'Guardar' }}
						</button>
					</div>
				</div>
			</div>
		</div>
	`,
	styles: `
		.logo-preview {
			width: 64px;
			height: 64px;
			object-fit: cover;
			border-radius: 0.5rem;
			flex-shrink: 0;
			background: #16181d;
			border: 1px solid rgba(255, 255, 255, 0.08);
		}
		.logo-preview-empty {
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 1.5rem;
			color: rgba(255, 255, 255, 0.35);
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceSettingsModalComponent {
	private readonly platformSettingsService = inject(PlatformSettingsService);

	loading = signal(true);
	saving = signal(false);
	logoUrl = signal<string | null>(null);
	uploadingLogo = signal(false);
	logoError = signal('');
	private loaded = false;

	form = new FormGroup({
		invoiceIssuerName: new FormControl<string>('', { nonNullable: true }),
		invoiceIssuerRnc: new FormControl<string>('', { nonNullable: true }),
		invoiceIssuerEmail: new FormControl<string>('', { nonNullable: true }),
		invoiceIssuerPhone: new FormControl<string>('', { nonNullable: true }),
		invoiceIssuerAddress: new FormControl<string>('', { nonNullable: true }),
		invoiceBankName: new FormControl<string>('', { nonNullable: true }),
		invoiceBankAccountType: new FormControl<string>('', { nonNullable: true }),
		invoiceBankAccountNumber: new FormControl<string>('', { nonNullable: true }),
		invoiceBankAccountHolder: new FormControl<string>('', { nonNullable: true }),
		invoiceNcfPrefix: new FormControl<string>('', { nonNullable: true }),
		invoiceNcfNext: new FormControl<string>('', { nonNullable: true }),
	});

	// Se carga recién al abrir el modal (no en ngOnInit) porque este componente vive montado todo
	// el tiempo en super-admin.component — cargar en el constructor pediría los settings en cada
	// visita al panel aunque el usuario nunca abra este modal.
	onOpen() {
		if (this.loaded) return;
		this.loaded = true;
		this.loading.set(true);
		this.platformSettingsService.getSettings().subscribe({
			next: (settings) => {
				this.form.reset(settings);
				this.logoUrl.set(settings.invoiceIssuerLogoUrl || null);
				this.loading.set(false);
			},
			error: (err: HttpErrorResponse) => {
				this.loading.set(false);
				this.loaded = false;
				showError(extractErrorMessage(err));
			},
		});
	}

	onClose() {
		// no-op — el form conserva el último valor cargado/guardado para la próxima apertura.
	}

	onLogoSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		this.uploadingLogo.set(true);
		this.logoError.set('');
		this.platformSettingsService.uploadLogo(file).subscribe({
			next: ({ url }) => this.saveLogo(`${environment.apiUrl}${url}`),
			error: (err: HttpErrorResponse) => {
				this.uploadingLogo.set(false);
				this.logoError.set(extractErrorMessage(err));
			},
		});
	}

	removeLogo() {
		confirm('¿Quitar el logo de la factura?', {
			onConfirm: () => this.saveLogo(''),
		});
	}

	private saveLogo(logoUrl: string) {
		this.uploadingLogo.set(true);
		this.logoError.set('');
		this.platformSettingsService.setSetting('invoiceIssuerLogoUrl', logoUrl).subscribe({
			next: () => {
				this.uploadingLogo.set(false);
				this.logoUrl.set(logoUrl || null);
			},
			error: (err: HttpErrorResponse) => {
				this.uploadingLogo.set(false);
				this.logoError.set(extractErrorMessage(err));
			},
		});
	}

	save() {
		this.saving.set(true);
		const value = this.form.getRawValue();
		const keys = Object.keys(value) as (keyof typeof value)[];
		forkJoin(keys.map((key) => this.platformSettingsService.setSetting(key, value[key]))).subscribe({
			next: () => {
				this.saving.set(false);
				closeModal('invoiceSettingsModal');
			},
			error: (err: HttpErrorResponse) => {
				this.saving.set(false);
				showError(extractErrorMessage(err));
			},
		});
	}
}
