import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { QRService, SaleTicket } from '../../services/qr.service';
import { Events } from '../../../../../models/events/events';
import { Area } from '../../../../../models/maps/area';
import { Seat } from '../../../../../models/maps/seat';
import { Ticket } from '../../../../../models/tickets/ticket';
import { User } from '../../../../../models/users/user';
import { EventsService } from '../../../events/services/events.service';
import { TicketsService } from '../../../tickets/services/tickets.service';
import { SeatsService } from '../../../maps/services/seats.service';
import { UserService } from '../../../users/services/user.service';

declare const bootstrap: any;

@Component({
	selector: 'create-qr-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="createQrModal" tabindex="-1" aria-labelledby="createQrModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createQrModalLabel">Vender ticket / Generar QR</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="mb-3">
								<label>Event</label>
								<select class="custom-select d-block w-100" formControlName="eventId" (change)="onEventChange()">
									<option [ngValue]="null">Choose...</option>
									@for (event of events(); track event.id) {
										<option [ngValue]="event.id">{{ event.name }}</option>
									}
								</select>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Ticket type</label>
									<select class="custom-select d-block w-100" formControlName="ticketId">
										<option [ngValue]="null">Choose...</option>
										@for (ticket of tickets(); track ticket.id) {
											<option [ngValue]="ticket.id">{{ ticket.name }} — {{ ticket.type }} ({{ ticket.price }} USD)</option>
										}
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label>Area</label>
									<select class="custom-select d-block w-100" [formControl]="areaControl" (change)="onAreaChange()">
										<option [ngValue]="null">Choose...</option>
										@for (area of areas(); track area.id) {
											<option [ngValue]="area.id">{{ area.name }}</option>
										}
									</select>
								</div>
							</div>
							<div class="mb-3">
								<label>Seat</label>
								<select class="custom-select d-block w-100" formControlName="seatId">
									<option [ngValue]="null">Choose...</option>
									@for (seat of seats(); track seat.id) {
										<option [ngValue]="seat.id">{{ seat.name }}</option>
									}
								</select>
								@if (areaControl.value && !seats().length) {
									<div class="form-text">Esta área todavía no tiene asientos creados.</div>
								}
							</div>
							<div class="mb-3">
								<label>Client</label>
								<select class="custom-select d-block w-100" formControlName="clientId">
									<option [ngValue]="null">Choose...</option>
									@for (client of clients(); track client.id) {
										<option [ngValue]="client.id">{{ client.name }} {{ client.lastname }} ({{ client.username }})</option>
									}
								</select>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Paid type</label>
									<select class="custom-select d-block w-100" formControlName="paidType">
										<option value="">Choose...</option>
										<option value="Cash">Cash</option>
										<option value="Card">Card</option>
										<option value="Transfer">Transfer</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label>Description</label>
									<input type="text" class="form-control" formControlName="description" />
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" [disabled]="form.invalid" (click)="submit()">Create</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateQrModalComponent implements OnInit {
	private readonly fb = inject(FormBuilder);
	private readonly qrService = inject(QRService);
	private readonly eventsService = inject(EventsService);
	private readonly ticketsService = inject(TicketsService);
	private readonly seatsService = inject(SeatsService);
	private readonly userService = inject(UserService);

	qrCreated = output<SaleTicket>();
	errorMessage = '';

	events = signal<Events[]>([]);
	areas = signal<Area[]>([]);
	seats = signal<Seat[]>([]);
	tickets = signal<Ticket[]>([]);
	clients = signal<User[]>([]);

	areaControl = this.fb.control<number | null>(null);

	form = this.fb.group({
		eventId: this.fb.control<number | null>(null, Validators.required),
		ticketId: this.fb.control<number | null>(null, Validators.required),
		seatId: this.fb.control<number | null>(null, Validators.required),
		clientId: this.fb.control<number | null>(null, Validators.required),
		paidType: this.fb.control<string>('', Validators.required),
		description: this.fb.control<string>(''),
	});

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
		this.userService.getUsers().subscribe((users) => this.clients.set(users.filter((u) => u.type?.type === 'CLIENT')));
	}

	onEventChange() {
		const eventId = this.form.controls.eventId.value;
		this.areas.set([]);
		this.seats.set([]);
		this.tickets.set([]);
		this.areaControl.setValue(null);
		this.form.patchValue({ seatId: null, ticketId: null });

		if (!eventId) return;

		this.ticketsService.getTicketsByEvent(eventId).subscribe((tickets) => this.tickets.set(tickets));
		this.eventsService.getEvent(eventId).subscribe((event) => this.areas.set(event.map?.areas ?? []));
	}

	onAreaChange() {
		const areaId = this.areaControl.value;
		this.seats.set([]);
		this.form.patchValue({ seatId: null });

		if (!areaId) return;

		this.seatsService.getSeatsByArea(areaId).subscribe((seats) => this.seats.set(seats));
	}

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		this.qrService
			.createQR({
				eventId: value.eventId!,
				ticketId: value.ticketId!,
				seatId: value.seatId!,
				clientId: value.clientId!,
				paidType: value.paidType!,
				description: value.description ?? '',
			})
			.subscribe({
				next: (saleTicket) => {
					this.qrCreated.emit(saleTicket);
					this.reset();
					this.errorMessage = '';
					const modalEl = document.getElementById('createQrModal');
					if (modalEl) {
						bootstrap.Modal.getOrCreateInstance(modalEl).hide();
					}
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage = err.error?.error ?? err.message;
				},
			});
	}

	private reset() {
		this.form.reset({ eventId: null, ticketId: null, seatId: null, clientId: null, paidType: '', description: '' });
		this.areaControl.setValue(null);
		this.areas.set([]);
		this.seats.set([]);
		this.tickets.set([]);
	}
}
