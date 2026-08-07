import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { InvoiceSettings, PlatformSettingsService } from '../../services/platform-settings.service';
import { extractErrorMessage } from '../../../../utils/api-error';
import { error as showError } from '../../../../utils/messages';
import { closeModal } from '../../../../utils/modal';

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
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceSettingsModalComponent {
	private readonly platformSettingsService = inject(PlatformSettingsService);

	loading = signal(true);
	saving = signal(false);
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

	save() {
		this.saving.set(true);
		const value = this.form.getRawValue();
		const keys = Object.keys(value) as (keyof InvoiceSettings)[];
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
