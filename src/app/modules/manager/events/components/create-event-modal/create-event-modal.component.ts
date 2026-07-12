import { ChangeDetectionStrategy, Component, effect, inject, Input, model, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Events } from '../../../../../models/events/events';
import { EventsService } from '../../services/events.service';
import { Map } from '../../../../../models/maps/map';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

// dateOn representa un día calendario como medianoche UTC (ver utils/dates.ts) — leerlo con
// getters UTC evita que el <input type="date"> muestre un día antes/después en timezones
// detrás de UTC.
function toDateInputValue(date: Date): string {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(date.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

@Component({
	selector: 'app-create-event-modal',
	imports: [ReactiveFormsModule],
	template: `
  <div class="modal fade" id="createEventModal" tabindex="-1" aria-labelledby="createEventModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="createEventModalLabel">{{ event() ? 'Update' : 'Create' }} event</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" [formGroup]="eventForm" novalidate>
						<div class="row">
							<div class="col-md-12 mb-2">
								<label for="name" class="small mb-1">Event Name *</label>
								<input type="text" class="form-control form-control-sm" [class.is-invalid]="isInvalid('name')" placeholder="eventName" formControlName="name" />
								@if (isInvalid('name')) {
									<div class="invalid-feedback">El nombre es obligatorio.</div>
								}
							</div>
							<div class="col-md-4 mb-2">
								<label for="code" class="small mb-1">Start Date *</label>
								<input type="date" class="form-control form-control-sm" [class.is-invalid]="isInvalid('dateOn')" formControlName="dateOn" />
								@if (isInvalid('dateOn')) {
									<div class="invalid-feedback">Elegí una fecha.</div>
								}
							</div>
							<div class="col-md-4 mb-2">
								<label for="startTime" class="small mb-1">Hora de inicio *</label>
								<input type="time" class="form-control form-control-sm" [class.is-invalid]="isInvalid('startTime')" formControlName="startTime" />
								@if (isInvalid('startTime')) {
									<div class="invalid-feedback">Elegí una hora.</div>
								}
							</div>
							<div class="col-md-4 mb-2">
								<label for="code" class="small mb-1">Code </label>
								<input type="text" class="form-control form-control-sm" formControlName="code" />
							</div>
						</div>
						<div class="mb-2">
							<label for="description" class="small mb-1">Description </label>
							<input type="text" class="form-control form-control-sm" formControlName="description" />
						</div>

						<div class="row">
							<div class="col-md-6 mb-2">
								<label for="type" class="small mb-1">Type *</label>
								<select class="form-select form-select-sm" [class.is-invalid]="isInvalid('type')" formControlName="type">
									<option value="">Choose...</option>
									<option value="VIP">VIP</option>
									<option value="Normal">NORMAL</option>
								</select>
								@if (isInvalid('type')) {
									<div class="invalid-feedback">Elegí un tipo de evento.</div>
								}
							</div>
							<div class="col-md-6 mb-2">
								<label for="state" class="small mb-1">Statu *</label>
								<select class="form-select form-select-sm" [class.is-invalid]="isInvalid('active')" formControlName="active">
									<option value="">Choose...</option>
									<option [ngValue]="true">Active</option>
									<option [ngValue]="false">Inactive</option>
								</select>
								@if (isInvalid('active')) {
									<div class="invalid-feedback">Elegí un estado.</div>
								}
							</div>
							<div class="col-md-12 mb-2">
								<label for="map" class="small mb-1">Map <span class="text-muted">(opcional — necesario para vender tickets con asiento)</span></label>
								<div class="d-flex gap-2">
									<select class="form-select form-select-sm" formControlName="mapId">
										<option [ngValue]="null">Sin asignar</option>
										@for (map of maps; track map.id) {
											<option [ngValue]="map.id">{{ map.name }}</option>
										}
									</select>
									<button type="button" class="btn btn-outline-danger btn-sm text-nowrap" data-bs-toggle="modal" data-bs-target="#createMapModal">+ Map</button>
								</div>
								<div class="form-text">¿No está el mapa que buscás? Creá uno con "+ Map" y elegilo acá al volver.</div>
							</div>
						</div>
						@if (errorMessage) {
							<div class="text-danger mt-2">{{ errorMessage }}</div>
						}
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
					<button type="button" class="btn btn-danger btn-sm" (click)="submit()">{{ event() ? 'Update' : 'Create' }}</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEventModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly eventsService = inject(EventsService);

	@Input() maps: Map[] = [];

	event = model<Events | null>(null);
	eventCreated = output<Events>();
	eventUpdated = output<Events>();
	errorMessage = '';

	eventForm = this.fb.group({
		name: ['', Validators.required],
		code: [''],
		description: [''],
		dateOn: ['', Validators.required],
		startTime: ['', Validators.required],
		type: ['', Validators.required],
		active: [true, Validators.required],
		mapId: this.fb.control<number | null>(null),
	});

	constructor() {
		effect(() => {
			const current = this.event();
			this.errorMessage = '';
			if (current) {
				this.eventForm.patchValue({
					name: current.name,
					code: current.code,
					description: current.description,
					dateOn: toDateInputValue(current.dateOn),
					startTime: current.startTime ?? '',
					type: current.type,
					active: current.active,
					mapId: current.map?.id ?? null,
				});
			} else {
				this.eventForm.reset({ active: true, mapId: null });
			}
		});
	}

	isInvalid(controlName: keyof typeof this.eventForm.controls): boolean {
		const control = this.eventForm.controls[controlName];
		return control.invalid && control.touched;
	}

	submit() {
		if (this.eventForm.invalid) {
			this.eventForm.markAllAsTouched();
			return;
		}

		const value = this.eventForm.getRawValue();
		const payload = {
			name: value.name!,
			code: value.code ?? '',
			description: value.description ?? '',
			type: value.type!,
			dateOn: value.dateOn!,
			startTime: value.startTime!,
			active: value.active!,
			mapId: value.mapId,
		};

		const current = this.event();
		const request = current ? this.eventsService.updateEvent(current.id, payload) : this.eventsService.createEvent(payload);

		request.subscribe({
			next: (event) => {
				if (current) {
					this.eventUpdated.emit(event);
				} else {
					this.eventCreated.emit(event);
				}
				this.event.set(null);
				this.errorMessage = '';
				closeModal('createEventModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
