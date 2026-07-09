import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Events } from '../../../../../models/events/events';

declare const bootstrap: any;

@Component({
	selector: 'app-create-event-modal',
	imports: [ReactiveFormsModule],
	template: `
  <div class="modal fade" id="createEventModal" tabindex="-1" aria-labelledby="createEventModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="createEventModalLabel">Create event</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" [formGroup]="eventForm" novalidate>
						<div class="row">
							<div class="col-md-12 mb-3">
								<label for="name">Event Name </label>
								<input type="text" class="form-control" placeholder="eventName" formControlName="name" />
							</div>
							<div class="col-md-6 mb-3">
								<label for="code">Start Date </label>
								<input type="date" class="form-control" formControlName="dateOn" />
							</div>
							<div class="col-md-6 mb-3">
								<label for="code">Code </label>
								<input type="text" class="form-control" formControlName="code" />
							</div>
						</div>
						<div class="mb-3">
							<label for="description">Description </label>
							<input type="text" class="form-control" formControlName="description" />
						</div>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="firstName">Count</label>
								<input type="number" class="form-control" formControlName="count" required />
								<div class="invalid-feedback">Valid count is required.</div>
							</div>
							<div class="col-md-6 mb-3">
								<label for="lastName">Price</label>
								<input type="number" class="form-control" formControlName="price" required />
								<div class="invalid-feedback">Valid price is required.</div>
							</div>
						</div>

						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="type">Type</label>
								<select class="custom-select d-block w-100" formControlName="type" required>
									<option value="">Choose...</option>
									<option value="VIP">VIP</option>
									<option value="Normal">NORMAL</option>
								</select>
							</div>
							<div class="col-md-6 mb-3">
								<label for="state">Statu</label>
								<select class="custom-select d-block w-100" formControlName="active" required>
									<option value="">Choose...</option>
									<option [ngValue]="true">Active</option>
									<option [ngValue]="false">Inactive</option>
								</select>
							</div>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
					<button type="button" class="btn btn-danger" (click)="submit()">Create</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEventModalComponent {
	private readonly fb = inject(FormBuilder);

	eventCreated = output<Events>();

	eventForm = this.fb.group({
		name: ['', Validators.required],
		code: [''],
		description: [''],
		dateOn: ['', Validators.required],
		count: [null as number | null, Validators.required],
		price: [null as number | null, Validators.required],
		type: ['', Validators.required],
		active: [true, Validators.required],
	});

	submit() {
		if (this.eventForm.invalid) {
			this.eventForm.markAllAsTouched();
			return;
		}

		const value = this.eventForm.getRawValue();
		const now = new Date();

		const newEvent: Events = {
			id: Date.now(),
			userId: 0,
			clientId: 0,
			name: value.name!,
			img: '',
			code: value.code ?? '',
			type: value.type!,
			description: value.description ?? '',
			dateSale: now,
			dateOn: value.dateOn ? new Date(value.dateOn) : now,
			dateOff: now,
			active: value.active!,
			// El mapa se asigna después, desde el módulo de Maps — no existe selector de mapa en este form.
			areas: [],
			tickets: [],
			catalogs: [],
		};

		this.eventCreated.emit(newEvent);
		this.eventForm.reset({ active: true });

		const modalEl = document.getElementById('createEventModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).hide();
		}
	}
}
