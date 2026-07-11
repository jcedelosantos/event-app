import { ChangeDetectionStrategy, Component, computed, inject, OnInit, output, signal } from '@angular/core';
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
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

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
								<label>Event *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('eventId')" formControlName="eventId" (change)="onEventChange()">
									<option [ngValue]="null">Choose...</option>
									@for (event of events(); track event.id) {
										<option [ngValue]="event.id">{{ event.name }}</option>
									}
								</select>
								@if (isInvalid('eventId')) {
									<div class="invalid-feedback">Elegí el evento.</div>
								}
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Ticket type *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('ticketId')" formControlName="ticketId">
										<option [ngValue]="null">Choose...</option>
										@for (ticket of tickets(); track ticket.id) {
											<option [ngValue]="ticket.id">{{ ticket.name }} — {{ ticket.type }} ({{ ticket.price }} USD)</option>
										}
									</select>
									@if (isInvalid('ticketId')) {
										<div class="invalid-feedback">Elegí el tipo de ticket.</div>
									}
									@if (form.controls.eventId.value && !tickets().length) {
										<div class="form-text">Este evento todavía no tiene tickets creados.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label>Area *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="areaControl.invalid && areaControl.touched" [formControl]="areaControl" (change)="onAreaChange()">
										<option [ngValue]="null">Choose...</option>
										@for (area of areas(); track area.id) {
											<option [ngValue]="area.id">{{ area.name }}</option>
										}
									</select>
									@if (form.controls.eventId.value && !areas().length) {
										<div class="form-text">Este evento no tiene un mapa asignado, o su mapa no tiene áreas.</div>
									}
								</div>
							</div>
							<div class="mb-3">
								<label>Seat *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('seatId')" formControlName="seatId">
									<option [ngValue]="null">Choose...</option>
									@for (seat of availableSeats(); track seat.id) {
										<option [ngValue]="seat.id">{{ seat.name }}</option>
									}
								</select>
								@if (isInvalid('seatId')) {
									<div class="invalid-feedback">Elegí un asiento.</div>
								}
								@if (areaControl.value) {
									<div class="form-text">{{ availableSeats().length }} disponible(s) de {{ seats().length }} en esta área.</div>
								}
							</div>
							<div class="mb-3">
								<label>Client *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('clientId')" formControlName="clientId">
									<option [ngValue]="null">Choose...</option>
									@for (client of clients(); track client.id) {
										<option [ngValue]="client.id">{{ client.name }} {{ client.lastname }} ({{ client.username }})</option>
									}
								</select>
								@if (isInvalid('clientId')) {
									<div class="invalid-feedback">Elegí el comprador — tiene que ser un usuario de tipo Client.</div>
								}
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Paid type *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('paidType')" formControlName="paidType">
										<option value="">Choose...</option>
										<option value="Cash">Cash</option>
										<option value="Card">Card</option>
										<option value="Transfer">Transfer</option>
									</select>
									@if (isInvalid('paidType')) {
										<div class="invalid-feedback">Elegí la forma de pago.</div>
									}
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
						<button type="button" class="btn btn-danger" (click)="submit()">Create</button>
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
	soldSeatIds = signal<Set<number>>(new Set());

	availableSeats = computed(() => this.seats().filter((seat) => !this.soldSeatIds().has(seat.id)));

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
		this.soldSeatIds.set(new Set());
		this.areaControl.setValue(null);
		this.form.patchValue({ seatId: null, ticketId: null });

		if (!eventId) return;

		this.ticketsService.getTicketsByEvent(eventId).subscribe((tickets) => this.tickets.set(tickets));
		this.eventsService.getEvent(eventId).subscribe((event) => this.areas.set(event.map?.areas ?? []));
		this.qrService.getQRsByEvent(eventId).subscribe((sales) => this.soldSeatIds.set(new Set(sales.map((s) => s.seatId))));
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	onAreaChange() {
		const areaId = this.areaControl.value;
		this.seats.set([]);
		this.form.patchValue({ seatId: null });

		if (!areaId) return;

		this.seatsService.getSeatsByArea(areaId).subscribe((seats) => this.seats.set(seats));

		// Re-consultar qué asientos ya se vendieron cada vez que se cambia de área (no solo al abrir
		// el modal) — si el formulario queda abierto un rato y alguien compra por el link público
		// mientras tanto, esto evita mostrar como disponible un asiento que ya no lo está.
		const eventId = this.form.controls.eventId.value;
		if (eventId) {
			this.qrService.getQRsByEvent(eventId).subscribe((sales) => this.soldSeatIds.set(new Set(sales.map((s) => s.seatId))));
		}
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
					closeModal('createQrModal');
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage = extractErrorMessage(err);
					if (err.status === 409) {
						// El asiento se vendió entre que se cargó la lista y este submit — refrescar
						// para que el dropdown ya no lo muestre como disponible, y soltar la selección
						// vieja para que quede claro que hay que elegir otro.
						this.form.patchValue({ seatId: null });
						const eventId = this.form.controls.eventId.value;
						if (eventId) {
							this.qrService.getQRsByEvent(eventId).subscribe((sales) => this.soldSeatIds.set(new Set(sales.map((s) => s.seatId))));
						}
					}
				},
			});
	}

	private reset() {
		this.form.reset({ eventId: null, ticketId: null, seatId: null, clientId: null, paidType: '', description: '' });
		this.areaControl.setValue(null);
		this.areas.set([]);
		this.seats.set([]);
		this.tickets.set([]);
		this.soldSeatIds.set(new Set());
	}
}
