import { ChangeDetectionStrategy, Component, computed, effect, inject, Input, model, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Events } from '../../../../../models/events/events';
import { EventsService } from '../../services/events.service';
import { Map } from '../../../../../models/maps/map';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { AuthService } from '../../../../../core/services/auth.service';
import { UploadsService } from '../../../../../core/services/uploads.service';
import { environment } from '../../../../../../environments/environment';

declare const bootstrap: any;

// dateOn representa un día calendario como medianoche UTC (ver utils/dates.ts) — leerlo con
// getters UTC evita que el <input type="date"> muestre un día antes/después en timezones
// detrás de UTC.
function toDateInputValue(date: Date): string {
	const yyyy = date.getUTCFullYear();
	const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
	const dd = String(date.getUTCDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

// publishAt es un instante real (no un día calendario como dateOn) — a diferencia de
// toDateInputValue, acá SÍ usamos getters locales: el navegador interpreta y produce el string de
// <input type="datetime-local"> en la hora local del que lo está tipeando (el staff del club), y
// `new Date(value)` en el submit lo reconstruye correctamente sin necesitar ningún offset manual.
function toDateTimeInputValue(date: Date): string {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	const hh = String(date.getHours()).padStart(2, '0');
	const min = String(date.getMinutes()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

@Component({
	selector: 'app-create-event-modal',
	imports: [ReactiveFormsModule, DatePipe],
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
							<div class="col-md-12 mb-2">
								<label for="eventImage" class="small mb-1">Imagen del evento <span class="text-muted">(opcional — la foto/flyer que envía el cliente)</span></label>
								<div class="d-flex align-items-center gap-2">
									@if (eventForm.controls.img.value) {
										<img [src]="eventForm.controls.img.value" alt="" class="event-image-preview" />
									}
									<div class="flex-grow-1">
										<input type="file" accept="image/*" class="form-control form-control-sm" id="eventImage" (change)="onImageSelected($event)" [disabled]="uploading()" />
										@if (uploading()) {
											<div class="form-text">Subiendo imagen...</div>
										}
										@if (uploadError()) {
											<div class="text-danger small">{{ uploadError() }}</div>
										}
									</div>
								</div>
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
								<label for="dateOff" class="small mb-1">End Date <span class="text-muted">(opcional)</span></label>
								<input type="date" class="form-control form-control-sm" formControlName="dateOff" />
								<div class="form-text">Si no se llena, se usa la misma fecha de inicio.</div>
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
								<label for="publishAt" class="small mb-1">Publicar en el portal público <span class="text-muted">(opcional — programar fecha y hora)</span></label>
								<div class="d-flex align-items-center gap-2">
									<input type="datetime-local" id="publishAt" class="form-control form-control-sm" formControlName="publishAt" />
									@if (eventForm.controls.publishAt.value) {
										<button type="button" class="btn btn-outline-secondary btn-sm text-nowrap" (click)="eventForm.controls.publishAt.setValue(null)">Quitar</button>
									}
								</div>
								<div class="form-text">
									Si lo dejás vacío, el evento queda visible/comprable apenas lo creás. Si elegís una fecha, se oculta del
									portal público hasta ese momento.
								</div>
							</div>
							<div class="col-md-12 mb-2">
								<div class="form-check">
									<input type="checkbox" class="form-check-input" id="waitingRoomEnabled" formControlName="waitingRoomEnabled" />
									<label for="waitingRoomEnabled" class="form-check-label small">
										Sala de espera virtual <span class="text-muted">(para eventos de alta demanda)</span>
									</label>
								</div>
								@if (eventForm.controls.waitingRoomEnabled.value) {
									<div class="mt-1">
										<label for="waitingRoomBatchSize" class="small mb-1">Personas admitidas a la vez</label>
										<input
											type="number"
											id="waitingRoomBatchSize"
											class="form-control form-control-sm"
											style="max-width: 160px"
											formControlName="waitingRoomBatchSize"
											min="1"
											placeholder="Por defecto: 50"
										/>
										<div class="form-text">
											Los visitantes entran al picker de a tandas en vez de todos juntos — evita que se sature el sitio si mucha
											gente entra apenas se habilita la venta.
										</div>
									</div>
								}
							</div>
							<div class="col-md-6 mb-2">
								<label for="maxCapacity" class="small mb-1">Aforo máximo <span class="text-muted">(opcional — cupo total compartido entre todos los tickets)</span></label>
								<input type="number" id="maxCapacity" min="1" class="form-control form-control-sm" formControlName="maxCapacity" placeholder="Sin tope" />
								<div class="form-text">Se suma vendidos de Socio + Invitado + cualquier otro ticket, no cada uno por separado.</div>
							</div>
							@if (isClubTenant()) {
								<div class="col-md-6 mb-2">
									<label for="maxGuestsPerSponsor" class="small mb-1">Máx. invitados por socio <span class="text-muted">(opcional)</span></label>
									<input type="number" id="maxGuestsPerSponsor" min="0" class="form-control form-control-sm" formControlName="maxGuestsPerSponsor" placeholder="Por defecto: 2" />
								</div>
							}
							<div class="col-md-12 mb-2">
								<label for="paymentMode" class="small mb-1">Cobro <span class="text-muted">(pago online en el portal público, antes de reservar el asiento)</span></label>
								<select class="form-select form-select-sm" formControlName="paymentMode">
									<option value="NONE">Ninguno — registro gratis (como hoy)</option>
									<option value="PAYPAL">PayPal</option>
									<option value="LINK">Link de pago (transferencia, etc. — confirmás vos a mano)</option>
									<option value="BOTH">Ambos — el comprador elige</option>
								</select>
								<div class="form-text">Configurá las credenciales de PayPal y/o el link de pago en Settings → Pagos.</div>
							</div>
							<div class="col-md-6 mb-2">
								<label for="checkInWindowHours" class="small mb-1">Abrir check-in <span class="text-muted">(horas antes del inicio)</span></label>
								<input
									type="number"
									id="checkInWindowHours"
									class="form-control form-control-sm"
									[class.is-invalid]="isInvalid('checkInWindowHours')"
									formControlName="checkInWindowHours"
									min="0"
									max="72"
								/>
								@if (isInvalid('checkInWindowHours')) {
									<div class="invalid-feedback">Entre 0 y 72 horas.</div>
								}
								<div class="form-text">El scanner rechaza el ingreso antes de esta ventana (default 1 hora).</div>
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
									<button type="button" class="btn btn-outline-danger btn-sm text-nowrap" (click)="openMapModal()">+ Map</button>
								</div>
								<div class="form-text">¿No está el mapa que buscás? Creá uno con "+ Map" y elegilo acá al volver.</div>
							</div>
							@if (isChurchTenant()) {
								<div class="col-md-8 mb-2">
									<label for="hostName" class="small mb-1">Anfitrión <span class="text-muted">(opcional — habilita invitados sin cargo con tope)</span></label>
									<input type="text" class="form-control form-control-sm" placeholder="Nombre del anfitrión" formControlName="hostName" />
								</div>
								<div class="col-md-4 mb-2">
									<label for="maxHostGuests" class="small mb-1">Máx. invitados del anfitrión</label>
									<input type="number" min="0" class="form-control form-control-sm" formControlName="maxHostGuests" />
								</div>
							}
							@if (isClubTenant() && event()) {
								<div class="col-md-12 mb-2">
									<label for="linkedEventId" class="small mb-1">
										Vincular con otra fecha de este mismo evento <span class="text-muted">(opcional)</span>
									</label>
									<select class="form-select form-select-sm" formControlName="linkedEventId">
										<option [ngValue]="null">Sin vincular</option>
										@for (other of otherEvents(); track other.id) {
											<option [ngValue]="other.id">{{ other.name }} — {{ other.dateOn | date: 'dd/MM/yyyy' }}</option>
										}
									</select>
									<div class="form-text">
										Un socio o invitado que ya se registró en una de las dos fechas no va a poder registrarse en la otra.
									</div>
								</div>
							}
						</div>
						@if (errorMessage) {
							<div class="text-danger mt-2">{{ errorMessage }}</div>
						}
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
					<button type="button" class="btn btn-danger btn-sm" [disabled]="uploading() || submitting()" (click)="submit()">
						{{ submitting() ? 'Guardando...' : event() ? 'Update' : 'Create' }}
					</button>
				</div>
			</div>
		</div>
	</div>`,
	styles: [
		`
			.event-image-preview {
				width: 56px;
				height: 56px;
				object-fit: cover;
				border-radius: 0.375rem;
				flex-shrink: 0;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEventModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly eventsService = inject(EventsService);
	private readonly authService = inject(AuthService);
	private readonly uploadsService = inject(UploadsService);

	@Input() maps: Map[] = [];
	@Input() events: Events[] = [];

	event = model<Events | null>(null);
	eventCreated = output<Events>();
	eventUpdated = output<Events>();
	errorMessage = '';
	uploading = signal(false);
	uploadError = signal('');
	// Sin esto, un doble-click en "Create" (algo tan simple como un click impaciente mientras la
	// request todavía viaja) disparaba dos POST y creaba el mismo evento dos veces — bug real
	// reportado en producción.
	submitting = signal(false);

	isChurchTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CHURCH');
	isClubTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CLUB');

	// El evento que se está editando no puede vincularse consigo mismo.
	otherEvents = computed(() => this.events.filter((e) => e.id !== this.event()?.id));

	// El id del evento vinculado ANTES de abrir el form — solo se manda linkedEventId en el submit si
	// cambia, para no desvincular por accidente un vínculo que el usuario ni tocó (ver submit()).
	private originalLinkedEventId: number | null = null;

	eventForm = this.fb.group({
		name: ['', Validators.required],
		code: [''],
		description: [''],
		img: [''],
		dateOn: ['', Validators.required],
		dateOff: [''],
		startTime: ['', Validators.required],
		type: ['', Validators.required],
		active: [true, Validators.required],
		mapId: this.fb.control<number | null>(null),
		hostName: [''],
		maxHostGuests: this.fb.control<number | null>(null),
		linkedEventId: this.fb.control<number | null>(null),
		paymentMode: this.fb.control<'NONE' | 'PAYPAL' | 'LINK' | 'BOTH'>('NONE'),
		checkInWindowHours: this.fb.control<number>(1, [Validators.required, Validators.min(0), Validators.max(72)]),
		publishAt: this.fb.control<string | null>(null),
		waitingRoomEnabled: this.fb.control<boolean>(false),
		waitingRoomBatchSize: this.fb.control<number | null>(null),
		maxCapacity: this.fb.control<number | null>(null),
		maxGuestsPerSponsor: this.fb.control<number | null>(null),
	});

	constructor() {
		effect(() => {
			const current = this.event();
			this.errorMessage = '';
			this.uploadError.set('');
			if (current) {
				this.originalLinkedEventId = current.duplicateGroupKey
					? (this.events.find((e) => e.id !== current.id && e.duplicateGroupKey === current.duplicateGroupKey)?.id ?? null)
					: null;
				this.eventForm.patchValue({
					name: current.name,
					code: current.code,
					description: current.description,
					img: current.img ?? '',
					dateOn: toDateInputValue(current.dateOn),
					dateOff: current.dateOff ? toDateInputValue(current.dateOff) : '',
					startTime: current.startTime ?? '',
					type: current.type,
					active: current.active,
					mapId: current.map?.id ?? null,
					hostName: current.hostName ?? '',
					maxHostGuests: current.maxHostGuests ?? null,
					linkedEventId: this.originalLinkedEventId,
					paymentMode: current.paymentMode ?? 'NONE',
					checkInWindowHours: current.checkInWindowHours ?? 1,
					publishAt: current.publishAt ? toDateTimeInputValue(current.publishAt) : null,
					waitingRoomEnabled: current.waitingRoomEnabled ?? false,
					waitingRoomBatchSize: current.waitingRoomBatchSize ?? null,
					maxCapacity: current.maxCapacity ?? null,
					maxGuestsPerSponsor: current.maxGuestsPerSponsor ?? null,
				});
			} else {
				this.originalLinkedEventId = null;
				this.eventForm.reset({
					active: true,
					mapId: null,
					hostName: '',
					maxHostGuests: null,
					linkedEventId: null,
					paymentMode: 'NONE',
					checkInWindowHours: 1,
					publishAt: null,
					waitingRoomEnabled: false,
					waitingRoomBatchSize: null,
					maxCapacity: null,
					maxGuestsPerSponsor: null,
				});
			}
		});
	}

	// Precarga el form con los datos de otro evento para "duplicar sin empezar de cero" — a
	// propósito NO toca event() (queda en null, submit() lo trata como creación, no como edición) ni
	// copia code/dateOn/dateOff/startTime: el usuario tiene que elegir la fecha nueva sí o sí, tanto
	// para que tenga sentido como para no chocar con la validación de fecha+mapa duplicados.
	prefillForDuplicate(source: Events) {
		this.event.set(null);
		this.errorMessage = '';
		this.uploadError.set('');
		this.eventForm.reset({
			active: true,
			mapId: source.map?.id ?? null,
			hostName: source.hostName ?? '',
			maxHostGuests: source.maxHostGuests ?? null,
			linkedEventId: null,
			paymentMode: source.paymentMode ?? 'NONE',
			checkInWindowHours: source.checkInWindowHours ?? 1,
			publishAt: null,
			waitingRoomEnabled: source.waitingRoomEnabled ?? false,
			waitingRoomBatchSize: source.waitingRoomBatchSize ?? null,
			maxCapacity: source.maxCapacity ?? null,
			maxGuestsPerSponsor: source.maxGuestsPerSponsor ?? null,
		});
		this.eventForm.patchValue({
			name: `${source.name} (copia)`,
			description: source.description,
			img: source.img ?? '',
			type: source.type,
		});
	}

	isInvalid(controlName: keyof typeof this.eventForm.controls): boolean {
		const control = this.eventForm.controls[controlName];
		return control.invalid && control.touched;
	}

	// Cierra este modal antes de abrir #createMapModal en vez de apilarlo encima — Bootstrap no
	// soporta bien modales anidados y eso dejaba un backdrop huérfano bloqueando toda la página
	// hasta refrescar (ver utils/modal.ts). El form no pierde lo tipeado: el componente sigue vivo,
	// solo oculto — events.component.ts reabre este modal cuando #createMapModal se cierra.
	openMapModal() {
		closeModal('createEventModal');
		const modalEl = document.getElementById('createMapModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onImageSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			return;
		}

		this.uploading.set(true);
		this.uploadError.set('');
		this.uploadsService.uploadImage(file).subscribe({
			next: ({ url }) => {
				this.eventForm.controls.img.setValue(`${environment.apiUrl}${url}`);
				this.uploading.set(false);
			},
			error: (err: HttpErrorResponse) => {
				this.uploadError.set(extractErrorMessage(err));
				this.uploading.set(false);
			},
		});
	}

	submit() {
		if (this.submitting()) return;
		if (this.eventForm.invalid) {
			this.eventForm.markAllAsTouched();
			return;
		}

		const value = this.eventForm.getRawValue();
		const current = this.event();
		const linkedEventIdChanged = !!current && value.linkedEventId !== this.originalLinkedEventId;
		const payload = {
			name: value.name!,
			code: value.code ?? '',
			description: value.description ?? '',
			img: value.img ?? '',
			type: value.type!,
			dateOn: value.dateOn!,
			dateOff: value.dateOff?.trim() ? value.dateOff : undefined,
			startTime: value.startTime!,
			active: value.active!,
			mapId: value.mapId,
			hostName: value.hostName?.trim() ? value.hostName.trim() : null,
			maxHostGuests: value.maxHostGuests,
			linkedEventId: linkedEventIdChanged ? value.linkedEventId : undefined,
			paymentMode: value.paymentMode!,
			checkInWindowHours: value.checkInWindowHours!,
			publishAt: value.publishAt ? new Date(value.publishAt) : null,
			waitingRoomEnabled: value.waitingRoomEnabled!,
			waitingRoomBatchSize: value.waitingRoomBatchSize,
			maxCapacity: value.maxCapacity,
			maxGuestsPerSponsor: value.maxGuestsPerSponsor,
		};
		const request = current ? this.eventsService.updateEvent(current.id, payload) : this.eventsService.createEvent(payload);

		this.submitting.set(true);
		request.subscribe({
			next: (event) => {
				this.submitting.set(false);
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
				this.submitting.set(false);
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
