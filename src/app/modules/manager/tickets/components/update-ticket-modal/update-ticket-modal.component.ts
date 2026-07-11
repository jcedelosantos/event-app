import { ChangeDetectionStrategy, Component, effect, inject, Input, model, OnInit, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Ticket } from '../../../../../models/tickets/ticket';
import { Events } from '../../../../../models/events/events';
import { TicketsService } from '../../services/tickets.service';
import { EventsService } from '../../../events/services/events.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'app-update-ticket-modal',
	imports: [ReactiveFormsModule],
	template: ` <div class="modal fade" id="updateTicketModal" tabindex="-1" aria-labelledby="updateTicketModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="updateTicketModalLabel">{{ (ticket()?.id ?? 0) > 0 ? 'Update' : 'Create' }} ticket</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" novalidate="" [formGroup]="form">
						<div class="mb-3">
							<label for="name">Name *</label>
							<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
							@if (isInvalid('name')) {
								<div class="invalid-feedback">El nombre es obligatorio.</div>
							}
						</div>
						<div class="mb-3">
							<label for="description">Description </label>
							<input type="text" class="form-control" formControlName="description" />
						</div>
						<div class="mb-3">
							<label for="event">Event *</label>
							<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('eventId')" formControlName="eventId">
								<option [ngValue]="null">Choose...</option>
								@for (event of events(); track event.id) {
									<option [ngValue]="event.id">{{ event.name }}</option>
								}
							</select>
							@if (isInvalid('eventId')) {
								<div class="invalid-feedback">Elegí el evento al que pertenece este ticket.</div>
							}
						</div>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="count">Count *</label>
								<input type="number" class="form-control" [class.is-invalid]="isInvalid('count')" formControlName="count" />
								@if (isInvalid('count')) {
									<div class="invalid-feedback">Ingresá el cupo disponible.</div>
								}
							</div>
							<div class="col-md-6 mb-3">
								<label for="price">Price *</label>
								<input type="number" class="form-control" [class.is-invalid]="isInvalid('price')" formControlName="price" />
								@if (isInvalid('price')) {
									<div class="invalid-feedback">Ingresá un precio.</div>
								}
							</div>
						</div>

						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="type">Type *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('type')" formControlName="type">
									<option [ngValue]="null">Choose...</option>
									@for (type of typeList(); track type) {
										<option [ngValue]="type">{{ type }}</option>
									}
								</select>
								@if (isInvalid('type')) {
									<div class="invalid-feedback">Elegí un tipo de ticket.</div>
								}
							</div>
							<div class="col-md-6 mb-3">
								<label for="state">Status</label>
								<select class="custom-select d-block w-100" formControlName="active">
									@for (status of activeList(); track status.label) {
										<option [ngValue]="status.value">{{ status.label }}</option>
									}
								</select>
							</div>
						</div>
						@if (errorMessage) {
							<div class="text-danger">{{ errorMessage }}</div>
						}
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Close</button>
					<button type="button" class="btn btn-primary btn-sm" (click)="save()">
						<i class="bi bi-floppy-fill" aria-hidden="true"></i> {{ (ticket()?.id ?? 0) > 0 ? 'Update' : 'Create' }}
					</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateTicketModalComponent implements OnInit {
	private readonly ticketsService = inject(TicketsService);
	private readonly eventsService = inject(EventsService);

	ticket = model<Ticket | null>(null);
	@Input() defaultEventId: number | null = null;
	ticketSaved = output<void>();
	errorMessage = '';

	events = signal<Events[]>([]);

	typeList = signal<string[]>(['VIP', 'Normal']);
	activeList = signal<{ label: string; value: boolean }[]>([
		{ label: 'Active', value: true },
		{ label: 'Inactive', value: false },
	]);

	form = new FormGroup({
		name: new FormControl<string | null>(null, Validators.required),
		description: new FormControl<string | null>(null),
		eventId: new FormControl<number | null>(null, Validators.required),
		type: new FormControl<string | null>(null, Validators.required),
		count: new FormControl<number | null>(null, Validators.required),
		active: new FormControl<boolean>(true, [Validators.required]),
		price: new FormControl<number | null>(null, Validators.required),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const current = this.ticket();
			if (current) {
				this.form.patchValue({ ...current });
			} else {
				this.form.reset({ active: true, eventId: this.defaultEventId });
			}
		});
	}

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	save() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		const payload = {
			name: value.name!,
			description: value.description ?? '',
			eventId: value.eventId!,
			type: value.type!,
			count: value.count!,
			active: value.active!,
			price: value.price!,
		};

		const current = this.ticket();
		const request = current ? this.ticketsService.updateTicket(current.id, payload) : this.ticketsService.createTicket(payload);

		request.subscribe({
			next: () => {
				this.ticketSaved.emit();
				this.ticket.set(null);
				this.errorMessage = '';
				closeModal('updateTicketModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
