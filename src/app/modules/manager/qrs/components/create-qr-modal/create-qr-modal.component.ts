import { ChangeDetectionStrategy, Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { AttendeeType, QRService, SaleTicket } from '../../services/qr.service';
import { ChildrenService } from '../../services/children.service';
import { Events } from '../../../../../models/events/events';
import { Area } from '../../../../../models/maps/area';
import { Seat } from '../../../../../models/maps/seat';
import { Ticket } from '../../../../../models/tickets/ticket';
import { Product } from '../../../../../models/products/product';
import { User } from '../../../../../models/users/user';
import { EventsService } from '../../../events/services/events.service';
import { TicketsService } from '../../../tickets/services/tickets.service';
import { SeatsService } from '../../../maps/services/seats.service';
import { ProductsService } from '../../../products/services/products.service';
import { UserService } from '../../../users/services/user.service';
import { AuthService } from '../../../../../core/services/auth.service';
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
										@for (ticket of availableTickets(); track ticket.id) {
											<option [ngValue]="ticket.id">{{ ticket.name }} — {{ ticket.type }} ({{ ticket.price }} USD, {{ ticket.count }} en stock)</option>
										}
									</select>
									@if (isInvalid('ticketId')) {
										<div class="invalid-feedback">Elegí el tipo de ticket.</div>
									}
									@if (form.controls.eventId.value && !tickets().length) {
										<div class="form-text">Este evento todavía no tiene tickets creados.</div>
									} @else if (form.controls.eventId.value && !availableTickets().length) {
										<div class="form-text">Todos los tickets de este evento están agotados.</div>
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
							@if (!showQuickClient()) {
								<div class="mb-3">
									<label>Client *</label>
									<div class="d-flex gap-2">
										<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('clientId')" formControlName="clientId">
											<option [ngValue]="null">Choose...</option>
											@for (client of clients(); track client.id) {
												<option [ngValue]="client.id">{{ client.name }} {{ client.lastname }} ({{ client.username }})</option>
											}
										</select>
										<button type="button" class="btn btn-outline-danger text-nowrap" (click)="toggleQuickClient(true)">+ Nuevo cliente</button>
									</div>
									@if (isInvalid('clientId')) {
										<div class="invalid-feedback">Elegí el comprador — tiene que ser un usuario de tipo Client.</div>
									}
								</div>
							} @else {
								<div class="border rounded p-2 mb-3">
									<div class="d-flex justify-content-between align-items-center mb-2">
										<label class="mb-0">Nuevo cliente (walk-in) *</label>
										<button type="button" class="btn btn-sm btn-outline-secondary" (click)="toggleQuickClient(false)">Usar cliente existente</button>
									</div>
									<div class="row" [formGroup]="quickClientForm">
										<div class="col-md-6 mb-2">
											<input type="text" class="form-control form-control-sm" placeholder="Nombre *" formControlName="name" [class.is-invalid]="isQuickClientInvalid('name')" />
										</div>
										<div class="col-md-6 mb-2">
											<input type="text" class="form-control form-control-sm" placeholder="Apellido *" formControlName="lastname" [class.is-invalid]="isQuickClientInvalid('lastname')" />
										</div>
										<div class="col-md-6 mb-2">
											<input type="email" class="form-control form-control-sm" placeholder="Email *" formControlName="email" [class.is-invalid]="isQuickClientInvalid('email')" />
										</div>
										<div class="col-md-6 mb-2">
											<input type="text" class="form-control form-control-sm" placeholder="Teléfono *" formControlName="phone" [class.is-invalid]="isQuickClientInvalid('phone')" />
										</div>
										<div class="col-md-6 mb-2">
											<input type="text" class="form-control form-control-sm" [placeholder]="isChurchTenant() ? 'Carnet (opcional)' : 'Carnet *'" formControlName="carnet" [class.is-invalid]="isQuickClientInvalid('carnet')" />
										</div>
									</div>
								</div>
							}
							@if (isChurchTenant() && hostGuestConfig(); as hostConfig) {
								<div class="form-check mb-3">
									<input type="checkbox" class="form-check-input" id="isHostGuest" formControlName="isHostGuest" [class.is-invalid]="isHostGuestAtCap()" />
									<label class="form-check-label" for="isHostGuest">
										Invitado de {{ hostConfig.hostName }} — sin cargo ({{ hostGuestsUsed() }}/{{ hostConfig.maxHostGuests }})
									</label>
									@if (isHostGuestAtCap()) {
										<div class="invalid-feedback d-block">Este anfitrión ya alcanzó su máximo de invitados para este evento.</div>
									}
								</div>
							}
							@if (isChurchTenant()) {
								<div class="border rounded p-2 mb-3">
									<div class="d-flex justify-content-between align-items-center mb-2">
										<label class="mb-0">¿Vienen con hijos?</label>
										<button type="button" class="btn btn-sm btn-outline-danger" (click)="addChildDraft()">+ Agregar hijo/a</button>
									</div>
									@for (child of childrenDraft(); track $index) {
										<div class="row g-2 align-items-center mb-2">
											<div class="col-md-5">
												<input
													type="text"
													class="form-control form-control-sm"
													placeholder="Nombre del hijo/a"
													[value]="child.name"
													(input)="updateChildDraft($index, { name: $any($event.target).value })"
												/>
											</div>
											<div class="col-md-3">
												<input
													type="number"
													min="0"
													max="17"
													class="form-control form-control-sm"
													placeholder="Edad"
													[value]="child.age"
													(input)="updateChildDraft($index, { age: $any($event.target).value })"
												/>
											</div>
											@if (hasMealOfTheDay()) {
												<div class="col-md-3 form-check">
													<input
														type="checkbox"
														class="form-check-input"
														[id]="'qrWantsMeal' + $index"
														[checked]="child.wantsMeal"
														(change)="updateChildDraft($index, { wantsMeal: $any($event.target).checked })"
													/>
													<label class="form-check-label small" [for]="'qrWantsMeal' + $index">¿Retira comida del día?</label>
												</div>
											}
											<div class="col-md-1">
												<button type="button" class="btn btn-sm btn-outline-secondary" (click)="removeChildDraft($index)">✕</button>
											</div>
										</div>
									}
								</div>
							}
							@if (isClubTenant()) {
								<div class="row">
									<div class="col-md-6 mb-3">
										<label>Socio o invitado *</label>
										<select class="custom-select d-block w-100" [class.is-invalid]="attendeeError() && !form.controls.attendeeType.value" formControlName="attendeeType">
											<option value="">Elegí...</option>
											<option value="SOCIO">Socio</option>
											<option value="INVITADO">Invitado</option>
										</select>
										@if (form.controls.attendeeType.value === 'SOCIO') {
											<div class="form-text">El comprador elegido arriba debe tener carnet de socio registrado.</div>
										}
									</div>
									@if (form.controls.attendeeType.value === 'INVITADO') {
										<div class="col-md-6 mb-3">
											<label>Carnet del socio que invita *</label>
											<input type="text" class="form-control" [class.is-invalid]="attendeeError() && !form.controls.sponsorCarnet.value" formControlName="sponsorCarnet" />
											<div class="form-text">Máximo 2 invitados por socio, por evento.</div>
										</div>
									}
								</div>
								@if (attendeeError()) {
									<div class="text-danger small mb-3">{{ attendeeError() }}</div>
								}
							}
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Paid type *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('paidType')" formControlName="paidType">
										<option value="">Choose...</option>
										<option value="Cash">Cash</option>
										<option value="Card">Card</option>
										<option value="Transfer">Transfer</option>
										<option value="Invitado">Invitado (sin cargo)</option>
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
							@if (errorMessage()) {
								<div class="text-danger">{{ errorMessage() }}</div>
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
	private readonly authService = inject(AuthService);
	private readonly productsService = inject(ProductsService);
	private readonly childrenService = inject(ChildrenService);

	qrCreated = output<SaleTicket>();
	// Signals (no campos planos): el componente es OnPush y estos se asignan desde el callback
	// async del subscribe de HTTP, fuera de un evento de template — sin signal, Angular nunca se
	// entera de que hay que repintar y el mensaje de error queda invisible aunque el backend lo mande.
	errorMessage = signal('');
	// Validación rápida en el cliente antes de mandar al backend (que es la fuente de verdad real,
	// ver lib/attendee.ts) — evita un viaje redondo por errores obvios como no elegir socio/invitado.
	attendeeError = signal('');

	events = signal<Events[]>([]);
	areas = signal<Area[]>([]);
	seats = signal<Seat[]>([]);
	tickets = signal<Ticket[]>([]);
	clients = signal<User[]>([]);
	soldSeatIds = signal<Set<number>>(new Set());
	// Ventas ya cargadas del evento elegido — reutilizadas para contar cupo de invitados del anfitrión
	// (no hace falta un endpoint aparte, ya se pide esta lista para soldSeatIds).
	salesForEvent = signal<SaleTicket[]>([]);
	showQuickClient = signal(false);
	products = signal<Product[]>([]);
	hasMealOfTheDay = computed(() => this.products().some((p) => p.isMealOfTheDay));

	// Borrador de hijos a registrar junto con la venta — solo se muestra/manda en tenants CHURCH,
	// mismo patrón (signal plano, no FormArray) que public-event.component.ts.
	childrenDraft = signal<{ name: string; age: string; wantsMeal: boolean }[]>([]);

	addChildDraft() {
		this.childrenDraft.update((list) => [...list, { name: '', age: '', wantsMeal: false }]);
	}

	removeChildDraft(index: number) {
		this.childrenDraft.update((list) => list.filter((_, i) => i !== index));
	}

	updateChildDraft(index: number, patch: Partial<{ name: string; age: string; wantsMeal: boolean }>) {
		this.childrenDraft.update((list) => list.map((c, i) => (i === index ? { ...c, ...patch } : c)));
	}

	availableSeats = computed(() => this.seats().filter((seat) => !this.soldSeatIds().has(seat.id)));
	availableTickets = computed(() => this.tickets().filter((t) => t.count > 0));
	// Solo los tenants tipo CLUB piden socio/invitado + carnet al reservar un asiento.
	isClubTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CLUB');
	isChurchTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CHURCH');

	// FormControl.value no es legible dentro de computed() sin este espejo manual — ver
	// constructor, se mantiene sincronizado con valueChanges.
	private eventIdValue = signal<number | null>(null);
	hostGuestConfig = computed(() => {
		const event = this.events().find((e) => e.id === this.eventIdValue());
		return event?.hostName && event.maxHostGuests != null ? { hostName: event.hostName, maxHostGuests: event.maxHostGuests } : null;
	});
	hostGuestsUsed = computed(() => this.salesForEvent().filter((s) => s.isHostGuest).length);
	isHostGuestAtCap = computed(() => {
		const config = this.hostGuestConfig();
		return !!config && this.hostGuestsUsed() >= config.maxHostGuests;
	});

	areaControl = this.fb.control<number | null>(null);

	form = this.fb.group({
		eventId: this.fb.control<number | null>(null, Validators.required),
		ticketId: this.fb.control<number | null>(null, Validators.required),
		seatId: this.fb.control<number | null>(null, Validators.required),
		clientId: this.fb.control<number | null>(null, Validators.required),
		paidType: this.fb.control<string>('', Validators.required),
		description: this.fb.control<string>(''),
		attendeeType: this.fb.control<AttendeeType | ''>(''),
		sponsorCarnet: this.fb.control<string>(''),
		isHostGuest: this.fb.control<boolean>(false),
	});

	quickClientForm = this.fb.group({
		name: this.fb.control('', Validators.required),
		lastname: this.fb.control('', Validators.required),
		email: this.fb.control('', [Validators.required, Validators.email]),
		phone: this.fb.control('', Validators.required),
		// En tenants CHURCH el carnet no es un dato relevante para identificar al comprador.
		carnet: this.fb.control('', this.isChurchTenant() ? [] : [Validators.required]),
	});

	constructor() {
		this.form.controls.eventId.valueChanges.subscribe((value) => this.eventIdValue.set(value));
	}

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
		this.salesForEvent.set([]);
		this.products.set([]);
		this.childrenDraft.set([]);
		this.areaControl.setValue(null);
		this.form.patchValue({ seatId: null, ticketId: null, isHostGuest: false });

		if (!eventId) return;

		this.ticketsService.getTicketsByEvent(eventId).subscribe((tickets) => this.tickets.set(tickets));
		this.eventsService.getEvent(eventId).subscribe((event) => this.areas.set(event.map?.areas ?? []));
		if (this.isChurchTenant()) {
			this.productsService.getProductsByEvent(eventId).subscribe((products) => this.products.set(products));
		}
		this.qrService.getQRsByEvent(eventId).subscribe((sales) => {
			this.salesForEvent.set(sales);
			this.soldSeatIds.set(new Set(sales.map((s) => s.seatId)));
		});
	}

	isQuickClientInvalid(controlName: keyof typeof this.quickClientForm.controls): boolean {
		const control = this.quickClientForm.controls[controlName];
		return control.invalid && control.touched;
	}

	// clientId deja de ser requerido en modo "nuevo cliente" — se completa recién al crear el
	// usuario en submit(), así que exigirlo de entrada bloquearía el form.invalid check de arriba.
	toggleQuickClient(show: boolean) {
		this.showQuickClient.set(show);
		if (show) {
			this.form.controls.clientId.clearValidators();
		} else {
			this.form.controls.clientId.setValidators(Validators.required);
			this.quickClientForm.reset({ name: '', lastname: '', email: '', phone: '', carnet: '' });
		}
		this.form.controls.clientId.updateValueAndValidity();
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
		this.attendeeError.set('');
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		if (this.isChurchTenant() && this.form.controls.isHostGuest.value && this.isHostGuestAtCap()) {
			this.errorMessage.set('Este anfitrión ya alcanzó su máximo de invitados para este evento.');
			return;
		}

		if (this.isChurchTenant() && this.childrenDraft().some((c) => !c.name.trim())) {
			this.errorMessage.set('Completá el nombre de cada hijo/a agregado, o quitalo.');
			return;
		}

		if (this.showQuickClient()) {
			if (this.quickClientForm.invalid) {
				this.quickClientForm.markAllAsTouched();
				return;
			}
			const quick = this.quickClientForm.getRawValue();
			// Walk-in sin cuenta previa: se crea un usuario Client mínimo con username/password
			// generados (nunca se los va a usar para loguearse, es solo el registro del comprador).
			const suffix = Date.now().toString(36);
			this.userService
				.createUser({
					name: quick.name!,
					lastname: quick.lastname!,
					email: quick.email!,
					phone: quick.phone!,
					carnet: quick.carnet!,
					username: `${quick.email!.split('@')[0]}-${suffix}`,
					password: Math.random().toString(36).slice(2, 10),
					gender: 'No especifica',
					adress: '',
					userType: 'CLIENT',
				})
				.subscribe({
					next: (client) => {
						this.clients.update((clients) => [...clients, client]);
						this.form.patchValue({ clientId: client.id });
						this.showQuickClient.set(false);
						this.createSaleTicket();
					},
					error: (err: HttpErrorResponse) => this.errorMessage.set(extractErrorMessage(err)),
				});
			return;
		}

		this.createSaleTicket();
	}

	private createSaleTicket() {
		const value = this.form.getRawValue();

		if (this.isClubTenant()) {
			if (!value.attendeeType) {
				this.attendeeError.set('Elegí si la reserva es de un socio o de un invitado.');
				return;
			}
			if (value.attendeeType === 'INVITADO' && !value.sponsorCarnet?.trim()) {
				this.attendeeError.set('Ingresá el carnet del socio que invita.');
				return;
			}
		}

		this.qrService
			.createQR({
				eventId: value.eventId!,
				ticketId: value.ticketId!,
				seatId: value.seatId!,
				clientId: value.clientId!,
				paidType: value.paidType!,
				description: value.description ?? '',
				...(value.attendeeType ? { attendeeType: value.attendeeType, sponsorCarnet: value.sponsorCarnet ?? undefined } : {}),
				...(this.isChurchTenant() ? { isHostGuest: value.isHostGuest ?? false } : {}),
			})
			.subscribe({
				next: (saleTicket) => {
					this.qrCreated.emit(saleTicket);
					const drafts = this.childrenDraft();
					if (this.isChurchTenant() && drafts.length) {
						this.registerChildren(saleTicket, drafts).subscribe({
							next: () => {
								this.reset();
								this.errorMessage.set('');
								closeModal('createQrModal');
							},
							error: (err: HttpErrorResponse) => {
								// El ticket ya se vendió — no se revierte, solo se avisa que el registro de
								// hijos falló (se puede reintentar aparte desde la vista de niños del evento).
								this.reset();
								this.errorMessage.set(`El ticket se vendió, pero no se pudieron registrar los hijos: ${extractErrorMessage(err)}`);
							},
						});
						return;
					}
					this.reset();
					this.errorMessage.set('');
					closeModal('createQrModal');
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage.set(extractErrorMessage(err));
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

	private registerChildren(saleTicket: SaleTicket, drafts: { name: string; age: string; wantsMeal: boolean }[]) {
		return forkJoin(
			drafts.map((c) =>
				this.childrenService.createChild({
					name: c.name.trim(),
					...(c.age.trim() ? { age: Number(c.age) } : {}),
					eventId: saleTicket.eventId,
					parentId: saleTicket.clientId,
					wantsMeal: c.wantsMeal,
				}),
			),
		);
	}

	private reset() {
		this.form.reset({ eventId: null, ticketId: null, seatId: null, clientId: null, paidType: '', description: '', attendeeType: '', sponsorCarnet: '', isHostGuest: false });
		this.toggleQuickClient(false);
		this.areaControl.setValue(null);
		this.areas.set([]);
		this.seats.set([]);
		this.tickets.set([]);
		this.soldSeatIds.set(new Set());
		this.salesForEvent.set([]);
		this.products.set([]);
		this.childrenDraft.set([]);
	}
}
