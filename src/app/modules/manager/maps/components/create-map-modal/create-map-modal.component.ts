import { ChangeDetectionStrategy, Component, effect, inject, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { GoogleMapsModule } from '@angular/google-maps';
import { Map } from '../../../../../models/maps/map';
import { MapsService } from '../../services/maps.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

const DEFAULT_LAT = 18.4628068;
const DEFAULT_LNG = -70.0412847;

@Component({
	selector: 'create-map-modal',
	imports: [ReactiveFormsModule, GoogleMapsModule],
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
								<label>Name *</label>
								<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
								@if (isInvalid('name')) {
									<div class="invalid-feedback">El nombre es obligatorio.</div>
								}
							</div>
							<div class="mb-3">
								<label>Description</label>
								<input type="text" class="form-control" formControlName="description" />
							</div>
							<div class="mb-2">
								<label>Ubicación <span class="text-muted">— click en el mapa para marcarla</span></label>
								<google-map height="220px" width="100%" [center]="center()" [zoom]="zoom()" (mapClick)="onMapClick($event)">
									<map-marker [position]="center()" />
								</google-map>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Latitude</label>
									<input type="number" step="any" class="form-control" formControlName="x" (change)="onManualCoordChange()" />
								</div>
								<div class="col-md-6 mb-3">
									<label>Longitude</label>
									<input type="number" step="any" class="form-control" formControlName="y" (change)="onManualCoordChange()" />
								</div>
							</div>
							<div class="mb-3">
								<label>Imagen del plano <span class="text-muted">(opcional)</span></label>
								<div class="form-text mb-1">
									Es distinto de la ubicación de arriba: esta imagen es el plano o foto del salón/venue que vas a usar más adelante como fondo para ubicar las áreas y asientos. Podés dejarlo vacío por
									ahora — igual vas a poder crear áreas y asientos sin foto, solo que sin ese fondo visual. Si tenés una imagen en internet, pegá su URL directa (termina en .jpg/.png/etc).
								</div>
								<input type="text" class="form-control" formControlName="img" placeholder="https://... (opcional)" (input)="onImgChange()" />
								@if (imgPreviewValid()) {
									<img [src]="mapForm.controls.img.value" class="img-preview mt-2" alt="Vista previa" (error)="imgPreviewValid.set(false)" />
								}
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
	styles: [
		`
			.img-preview {
				max-width: 100%;
				max-height: 140px;
				border-radius: 0.25rem;
				display: block;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateMapModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly mapsService = inject(MapsService);

	map = model<Map | null>(null);
	mapCreated = output<Map>();
	mapUpdated = output<Map>();
	errorMessage = '';

	center = signal<google.maps.LatLngLiteral>({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
	zoom = signal(12);
	imgPreviewValid = signal(false);

	mapForm = this.fb.group({
		name: ['', Validators.required],
		description: [''],
		img: [''],
		x: [DEFAULT_LAT, Validators.required],
		y: [DEFAULT_LNG, Validators.required],
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
				this.center.set({ lat: current.x, lng: current.y });
				this.zoom.set(15);
				this.onImgChange();
			} else {
				this.mapForm.reset({ name: '', description: '', img: '', x: DEFAULT_LAT, y: DEFAULT_LNG });
				this.center.set({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
				this.zoom.set(12);
				this.imgPreviewValid.set(false);
			}
		});
	}

	isInvalid(controlName: keyof typeof this.mapForm.controls): boolean {
		const control = this.mapForm.controls[controlName];
		return control.invalid && control.touched;
	}

	onImgChange() {
		const url = this.mapForm.controls.img.value?.trim();
		this.imgPreviewValid.set(!!url && /^https?:\/\//.test(url));
	}

	onMapClick(event: google.maps.MapMouseEvent) {
		const lat = event.latLng?.lat();
		const lng = event.latLng?.lng();
		if (lat === undefined || lng === undefined) return;

		this.center.set({ lat, lng });
		this.mapForm.patchValue({ x: lat, y: lng });
	}

	onManualCoordChange() {
		const { x, y } = this.mapForm.getRawValue();
		if (x !== null && y !== null) {
			this.center.set({ lat: x, lng: y });
		}
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
				closeModal('createMapModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
