import { ChangeDetectionStrategy, Component, effect, inject, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Map } from '../../../../../models/maps/map';
import { MapsService } from '../../services/maps.service';

declare const bootstrap: any;

@Component({
	selector: 'create-map-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="createMapModal" tabindex="-1" aria-labelledby="createMapModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createMapModalLabel">{{ map() ? 'Update' : 'Create' }} map</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="mapForm" novalidate>
							<div class="mb-3">
								<label>Name</label>
								<input type="text" class="form-control" formControlName="name" />
							</div>
							<div class="mb-3">
								<label>Description</label>
								<input type="text" class="form-control" formControlName="description" />
							</div>
							<div class="mb-3">
								<label>Image URL <span class="text-muted">(imagen de fondo del venue)</span></label>
								<input type="text" class="form-control" formControlName="img" placeholder="https://..." />
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Latitude</label>
									<input type="number" step="any" class="form-control" formControlName="x" />
								</div>
								<div class="col-md-6 mb-3">
									<label>Longitude</label>
									<input type="number" step="any" class="form-control" formControlName="y" />
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" (click)="submit()">{{ map() ? 'Update' : 'Create' }}</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateMapModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly mapsService = inject(MapsService);

	map = model<Map | null>(null);
	mapCreated = output<Map>();
	mapUpdated = output<Map>();
	errorMessage = '';

	mapForm = this.fb.group({
		name: ['', Validators.required],
		description: [''],
		img: [''],
		x: [18.4628068, Validators.required],
		y: [-70.0412847, Validators.required],
	});

	constructor() {
		effect(() => {
			const current = this.map();
			this.errorMessage = '';
			if (current) {
				this.mapForm.patchValue({
					name: current.name,
					description: current.description,
					img: current.img,
					x: current.x,
					y: current.y,
				});
			} else {
				this.mapForm.reset({ name: '', description: '', img: '', x: 18.4628068, y: -70.0412847 });
			}
		});
	}

	submit() {
		if (this.mapForm.invalid) {
			this.mapForm.markAllAsTouched();
			return;
		}

		const value = this.mapForm.getRawValue();
		const payload = {
			name: value.name!,
			description: value.description ?? '',
			img: value.img ?? '',
			x: value.x!,
			y: value.y!,
		};

		const current = this.map();
		const request = current ? this.mapsService.updateMap(current.id, payload) : this.mapsService.createMap(payload);

		request.subscribe({
			next: (map) => {
				if (current) {
					this.mapUpdated.emit(map);
				} else {
					this.mapCreated.emit(map);
				}
				this.map.set(null);
				this.errorMessage = '';
				const modalEl = document.getElementById('createMapModal');
				if (modalEl) {
					bootstrap.Modal.getOrCreateInstance(modalEl).hide();
				}
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = err.error?.error ?? err.message;
			},
		});
	}
}
