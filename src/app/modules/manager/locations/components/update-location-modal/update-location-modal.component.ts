import { ChangeDetectionStrategy, Component, effect, EventEmitter, inject, input, Output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '../../../../../models/locations/location';
import { LocationsService } from '../../services/locations.service';
import { extractErrorMessage } from '../../../../../utils/api-error';

declare const bootstrap: any;

@Component({
	selector: 'app-update-location-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="updateLocationModal" tabindex="-1" aria-labelledby="updateLocationModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<form [formGroup]="form" (ngSubmit)="submit()">
						<div class="modal-header">
							<h1 class="modal-title fs-5" id="updateLocationModalLabel">{{ location() ? 'Editar sede' : 'Nueva sede' }}</h1>
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
						</div>
						<div class="modal-body">
							<div class="mb-3">
								<label for="locationName" class="form-label small">Nombre</label>
								<input type="text" id="locationName" class="form-control" formControlName="name" placeholder="Ej. Sede Piantini" />
							</div>
							<div class="mb-3">
								<label for="locationAddress" class="form-label small">Dirección <span class="text-muted">(opcional)</span></label>
								<input type="text" id="locationAddress" class="form-control" formControlName="address" />
							</div>
							@if (location()) {
								<div class="form-check">
									<input class="form-check-input" type="checkbox" id="locationActive" formControlName="active" />
									<label class="form-check-label small" for="locationActive">Activa</label>
								</div>
							}
							@if (errorMessage()) {
								<div class="text-danger small mt-2">{{ errorMessage() }}</div>
							}
						</div>
						<div class="modal-footer">
							<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
							<button type="submit" class="btn btn-danger" [disabled]="form.invalid || saving()">
								{{ saving() ? 'Guardando...' : 'Guardar' }}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateLocationModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly locationsService = inject(LocationsService);

	location = input<Location | null>(null);
	@Output() locationSaved = new EventEmitter<void>();

	saving = signal(false);
	errorMessage = signal('');

	form = this.fb.nonNullable.group({
		name: ['', Validators.required],
		address: [''],
		active: [true],
	});

	constructor() {
		effect(() => {
			const location = this.location();
			this.form.reset({
				name: location?.name ?? '',
				address: location?.address ?? '',
				active: location?.active ?? true,
			});
			this.errorMessage.set('');
		});
	}

	submit() {
		if (this.form.invalid) return;
		this.saving.set(true);
		this.errorMessage.set('');

		const { name, address, active } = this.form.getRawValue();
		const payload = { name, address: address.trim() || null, active };
		const current = this.location();
		const request = current ? this.locationsService.updateLocation(current.id, payload) : this.locationsService.createLocation(payload);

		request.subscribe({
			next: () => {
				this.saving.set(false);
				this.locationSaved.emit();
				bootstrap.Modal.getOrCreateInstance(document.getElementById('updateLocationModal')).hide();
			},
			error: (err: HttpErrorResponse) => {
				this.saving.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}
}
