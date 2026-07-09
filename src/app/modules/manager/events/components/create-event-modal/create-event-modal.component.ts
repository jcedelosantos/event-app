import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Events } from '../../../../../models/events/events';
import { EventsService } from '../../services/events.service';

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
						@if (errorMessage) {
							<div class="text-danger">{{ errorMessage }}</div>
						}
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
	private readonly eventsService = inject(EventsService);

	eventCreated = output<Events>();
	errorMessage = '';

	eventForm = this.fb.group({
		name: ['', Validators.required],
		code: [''],
		description: [''],
		dateOn: ['', Validators.required],
		type: ['', Validators.required],
		active: [true, Validators.required],
	});

	submit() {
		if (this.eventForm.invalid) {
			this.eventForm.markAllAsTouched();
			return;
		}

		const value = this.eventForm.getRawValue();
		this.eventsService
			.createEvent({
				name: value.name!,
				code: value.code ?? '',
				description: value.description ?? '',
				type: value.type!,
				dateOn: value.dateOn!,
				active: value.active!,
			})
			.subscribe({
				next: (event) => {
					this.eventCreated.emit(event);
					this.eventForm.reset({ active: true });
					this.errorMessage = '';
					const modalEl = document.getElementById('createEventModal');
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
