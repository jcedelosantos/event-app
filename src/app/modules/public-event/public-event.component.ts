import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { QRCodeComponent } from 'angularx-qrcode';
import { AttendeeType, PublicArea, PublicEvent, PublicEventService, PublicSeat, PurchasedSaleTicket } from './services/public-event.service';
import { extractErrorMessage } from '../../utils/api-error';
import { shortSeatLabel } from '../../utils/seat-label';
import { warning } from '../../utils/messages';

const MAX_SEATS = 5;
// Un invitado (tenant CLUB) puede reservar como máximo 2 asientos en una sola compra — coincide con
// el tope de 2 invitados por socio por evento que ya valida el backend (ver api/src/lib/attendee.ts),
// esto solo evita que alguien arme una selección de 3+ asientos y recién se entere del rechazo al
// confirmar.
const MAX_INVITADO_SEATS = 2;

@Component({
	selector: 'app-public-event',
	imports: [ReactiveFormsModule, QRCodeComponent],
	template: `
		<div class="page" data-bs-theme="dark">
			@switch (step()) {
				@case ('loading') {
					<div class="center-msg">Cargando evento...</div>
				}
				@case ('not-found') {
					<div class="center-msg">
						<h4>No encontramos este evento</h4>
						<p class="text-body-secondary">Revisá el link o pedí uno nuevo a la organización.</p>
					</div>
				}
				@case ('confirmed') {
					<div class="container py-4" style="max-width: 640px;">
						<h3>¡Listo, {{ registerForm.controls.name.value }}!</h3>
						<p class="text-body-secondary">
							Guardá estos códigos QR — cada uno es tu entrada para un asiento. También te los enviamos a {{ registerForm.controls.email.value }} si el correo está configurado.
						</p>
						@for (sale of purchasedTickets(); track sale.id) {
							<div class="card mb-3">
								<div class="card-body d-flex justify-content-between align-items-center">
									<div>
										<div class="fw-bold">{{ event()?.name }}</div>
										<div class="text-body-secondary small">{{ sale.ticket.name }} ({{ sale.ticket.type }}) — {{ sale.seat.area.name }} / {{ sale.seat.name }}</div>
									</div>
									<qrcode [qrdata]="sale.codeQR" [width]="110" [errorCorrectionLevel]="'M'"></qrcode>
								</div>
							</div>
						}
					</div>
				}
				@default {
					@if (event(); as ev) {
						<div class="container py-4" style="max-width: 900px;">
							<h3>{{ ev.name }}</h3>
							<p class="text-body-secondary">
								{{ formatDate(ev.dateOn) }}
								@if (ev.startTime) {
									— {{ formatStartTime(ev.startTime) }}
								}
							</p>
							@if (ev.description) {
								<p>{{ ev.description }}</p>
							}

							@if (ev.tenantType === 'CLUB') {
								<div class="mb-4">
									<h5>1. Tus datos</h5>
									<form [formGroup]="registerForm" class="row g-2">
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Nombre" [class.is-invalid]="isInvalid('name')" formControlName="name" />
										</div>
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Apellido (opcional)" formControlName="lastname" />
										</div>
										<div class="col-md-6">
											<input type="email" class="form-control" placeholder="Email" [class.is-invalid]="isInvalid('email')" formControlName="email" />
										</div>
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Teléfono" [class.is-invalid]="isInvalid('phone')" formControlName="phone" />
										</div>
										<div class="col-md-6">
											<select
												class="form-select"
												[class.is-invalid]="attendeeError() && !registerForm.controls.attendeeType.value"
												formControlName="attendeeType"
											>
												<option value="">¿Sos socio o invitado?</option>
												<option value="SOCIO">Soy socio</option>
												<option value="INVITADO">Soy invitado de un socio</option>
											</select>
										</div>
										@if (attendeeTypeValue() === 'SOCIO') {
											<div class="col-md-6">
												<input
													type="text"
													class="form-control"
													placeholder="Tu carnet de socio"
													[class.is-invalid]="isInvalid('carnet')"
													formControlName="carnet"
												/>
											</div>
										} @else if (attendeeTypeValue() === 'INVITADO') {
											<div class="col-md-6">
												<input
													type="text"
													class="form-control"
													placeholder="Carnet del socio que te invita"
													[class.is-invalid]="attendeeError() && !registerForm.controls.sponsorCarnet.value"
													formControlName="sponsorCarnet"
												/>
												<div class="form-text">Como invitado podés elegir hasta 2 asientos.</div>
											</div>
										}
									</form>
									@if (attendeeError()) {
										<div class="small text-danger mt-2">{{ attendeeError() }}</div>
									}
								</div>
							} @else {
								<div class="mb-4">
									<h5>1. Elegí tu ticket</h5>
									@if (!ev.tickets.length) {
										<p class="text-body-secondary">Este evento todavía no tiene tickets a la venta.</p>
									}
									<div class="d-flex flex-wrap gap-2">
										@for (ticket of ev.tickets; track ticket.id) {
											<button
												type="button"
												class="btn btn-sm"
												[class.btn-danger]="selectedTicketId() === ticket.id"
												[class.btn-outline-danger]="selectedTicketId() !== ticket.id && ticket.count > 0"
												[class.btn-outline-secondary]="ticket.count <= 0"
												[disabled]="ticket.count <= 0"
												(click)="selectedTicketId.set(ticket.id)"
											>
												{{ ticket.name }} ({{ ticket.type }}) — {{ ticket.price }} USD
												@if (ticket.count <= 0) {
													<span class="badge text-bg-secondary ms-1">Agotado</span>
												}
											</button>
										}
									</div>
								</div>
							}

							<div class="mb-4">
								<div class="d-flex justify-content-between align-items-center mb-2">
									<h5 class="mb-0">2. Elegí tu(s) asiento(s)</h5>
									<span class="badge text-bg-danger">{{ selectedSeatIds().size }} / {{ effectiveMaxSeats() }}</span>
								</div>
								@if (!activeTicketId()) {
									<p class="text-body-secondary">
										@if (ev.tenantType === 'CLUB') {
											@if (!attendeeTypeValue()) {
												Completá tus datos arriba (decinos si sos socio o invitado) para poder elegir tu(s) asiento(s).
											} @else {
												Este evento no tiene un ticket de {{ attendeeTypeValue() === 'SOCIO' ? 'socio' : 'invitado' }} disponible — contactá a la organización.
											}
										} @else {
											Elegí primero un tipo de ticket arriba para poder elegir tu(s) asiento(s).
										}
									</p>
								} @else {
								@if (!ev.map || !ev.map.areas.length) {
									<p class="text-body-secondary">Este evento todavía no tiene asientos configurados.</p>
								}
								@if (ev.map && visibleAreas(ev).length !== ev.map.areas.length) {
									<p class="small text-body-secondary mb-2">Tu ticket solo da acceso al área que se muestra abajo.</p>
								}
								@for (area of visibleAreas(ev); track area.id) {
									<div class="card mb-3">
										<div class="card-header">{{ area.name }}</div>
										<div class="card-body">
											@if (!area.img) {
												<p class="small text-body-secondary mb-1">
													Esta área todavía no tiene una foto real del salón — se muestra un plano genérico como referencia.
												</p>
											}
											<div class="seat-picker-image">
												<img [src]="areaImgSrc(area)" class="seat-picker-bg" (load)="onImageLoad(area.id, $event)" (error)="onImageError(area.id)" />
												@if (imgSizes()[area.id]; as size) {
													@for (seat of ungroupedSeats(area); track seat.id) {
														<button
															type="button"
															class="seat-btn"
															[class.seat-taken]="!seat.available"
															[class.seat-selected]="selectedSeatIds().has(seat.id)"
															[disabled]="!seat.available"
															[style.top.%]="(seat.y / size.h) * 100"
															[style.left.%]="(seat.x / size.w) * 100"
															[title]="seat.name"
															(click)="toggleSeat(seat)"
														>
															{{ seatLabel(seat) }}
														</button>
													}
													@for (table of sortedTables(area); track table.id) {
														@if (seatsForTable(area, table.id).length) {
															<button
																type="button"
																class="table-btn"
																[class.table-full]="tableAvailableCount(area, table.id) === 0"
																[style.top.%]="(table.y / size.h) * 100"
																[style.left.%]="(table.x / size.w) * 100"
																[title]="table.name"
																(click)="onTableClick(area, table.id)"
															>
																{{ seatLabel(table) }}
																@if (tableSelectedCount(area, table.id) > 0) {
																	<span class="table-badge">{{ tableSelectedCount(area, table.id) }}</span>
																}
															</button>
														}
													}
												}
											</div>
										</div>
									</div>
								}
								}
							</div>

							@if (expandedTableSeats(); as info) {
								<div class="table-overlay-backdrop">
									<div class="table-overlay-panel">
										<h6 class="mb-3">{{ info.table.name }}</h6>
										<div class="d-flex flex-wrap gap-2 mb-3">
											@for (seat of info.seats; track seat.id) {
												<button
													type="button"
													class="table-seat-btn"
													[class.seat-taken]="!seat.available"
													[class.seat-selected]="selectedSeatIds().has(seat.id)"
													[disabled]="!seat.available"
													(click)="toggleSeat(seat)"
												>
													{{ seatLabel(seat) }}
												</button>
											}
										</div>
										<div class="d-flex gap-3 small text-body-secondary mb-3">
											<span><span class="legend-dot" style="background:#28a745"></span> Disponible</span>
											<span><span class="legend-dot" style="background:#6c757d"></span> Ocupado</span>
											<span><span class="legend-dot" style="background:var(--app-accent)"></span> Elegido</span>
										</div>
										<button type="button" class="btn btn-danger w-100" (click)="expandedTableId.set(null)">Confirmar selección</button>
									</div>
								</div>
							}

							@if (ev.tenantType !== 'CLUB') {
								<div class="mb-4">
									<h5>3. Tus datos</h5>
									<form [formGroup]="registerForm" class="row g-2">
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Nombre" [class.is-invalid]="isInvalid('name')" formControlName="name" />
										</div>
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Apellido (opcional)" formControlName="lastname" />
										</div>
										<div class="col-md-6">
											<input type="email" class="form-control" placeholder="Email" [class.is-invalid]="isInvalid('email')" formControlName="email" />
										</div>
										<div class="col-md-6">
											<input type="text" class="form-control" placeholder="Teléfono" [class.is-invalid]="isInvalid('phone')" formControlName="phone" />
										</div>
									</form>
								</div>
							}

							@if (errorMessage()) {
								<div class="alert alert-danger">{{ errorMessage() }}</div>
							}

							<button type="button" class="btn btn-danger btn-lg w-100" [disabled]="submitting()" (click)="submit(ev)">
								{{ submitting() ? 'Procesando...' : 'Confirmar y generar mis QR' }}
							</button>
						</div>
					}
				}
			}
		</div>
	`,
	styles: [
		`
			.page {
				min-height: 100vh;
				background: #0a0a0a;
				color: #fff;
			}
			.center-msg {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
			}
			.seat-picker-image {
				position: relative;
				display: inline-block;
				max-width: 100%;
			}
			.seat-picker-bg {
				max-width: 100%;
				display: block;
				border-radius: 0.375rem;
			}
			.seat-btn {
				position: absolute;
				width: 22px;
				height: 22px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 10px;
				line-height: 1;
				border-radius: 50%;
				border: 1px solid var(--app-accent);
				background: #1c1f24;
				color: #fff;
				cursor: pointer;
				transform: translate(-50%, -50%);
			}
			.seat-btn.seat-selected {
				background: var(--app-accent);
			}
			.seat-btn.seat-taken {
				background: #2a2a2a;
				border-color: #444;
				color: #666;
				cursor: not-allowed;
			}
			.table-btn {
				position: absolute;
				width: 32px;
				height: 32px;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 50%;
				border: 2px solid var(--app-accent);
				background: var(--app-accent);
				color: #fff;
				font-size: 13px;
				font-weight: 700;
				line-height: 1;
				cursor: pointer;
				transform: translate(-50%, -50%);
				text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
			}
			.table-btn.table-full {
				border-color: #6c757d;
				background: #6c757d;
			}
			.table-badge {
				position: absolute;
				top: -6px;
				right: -6px;
				background: #fff;
				color: var(--app-accent);
				font-size: 10px;
				font-weight: 700;
				line-height: 1;
				border-radius: 50%;
				min-width: 16px;
				height: 16px;
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 0 2px;
			}
			.table-overlay-backdrop {
				position: fixed;
				inset: 0;
				background: rgba(0, 0, 0, 0.7);
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 16px;
				z-index: 1050;
			}
			.table-overlay-panel {
				background: #16181c;
				border: 1px solid #2a2a2a;
				border-radius: 0.75rem;
				padding: 20px;
				width: 100%;
				max-width: 480px;
				max-height: 80vh;
				overflow-y: auto;
			}
			.table-seat-btn {
				min-width: 44px;
				height: 44px;
				padding: 0 8px;
				border-radius: 8px;
				border: none;
				background: #28a745;
				color: #fff;
				font-weight: 600;
				cursor: pointer;
			}
			.table-seat-btn.seat-selected {
				background: var(--app-accent);
			}
			.table-seat-btn.seat-taken {
				background: #6c757d;
				color: #ccc;
				cursor: not-allowed;
			}
			.legend-dot {
				display: inline-block;
				width: 10px;
				height: 10px;
				border-radius: 50%;
				margin-right: 4px;
				vertical-align: middle;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicEventComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly publicEventService = inject(PublicEventService);
	private readonly fb = inject(FormBuilder);

	readonly maxSeats = MAX_SEATS;
	// Mismo plano genérico que usa el editor del manager (seats.component.ts) cuando el área
	// todavía no tiene una foto real — así el picker público siempre tiene una referencia visual
	// del salón, en vez de caer a una lista plana sin ningún plano. Ruta ABSOLUTA (con "/" inicial):
	// esta página se abre casi siempre como carga directa de /e/:code (link/QR compartido, no
	// navegación interna), y una ruta relativa se resolvía contra ESA url en vez de la raíz del
	// sitio — el plano (y con él, todo el selector de asientos) rompía en cualquier evento sin foto.
	readonly defaultAreaBg = '/assets/images/default-area-bg.svg';

	// Si la foto real que cargó el manager ya no existe/está rota, cae al plano genérico en vez de
	// dejar el selector de asientos completamente vacío — la carga (load) nunca dispara con una
	// imagen rota, así que sin este fallback ni siquiera aparecían las mesas.
	brokenAreaImg = signal<Set<number>>(new Set());

	areaImgSrc(area: PublicArea): string {
		if (!area.img || this.brokenAreaImg().has(area.id)) return this.defaultAreaBg;
		return area.img;
	}

	onImageError(areaId: number) {
		if (!this.brokenAreaImg().has(areaId)) {
			this.brokenAreaImg.update((set) => new Set(set).add(areaId));
		}
	}

	step = signal<'loading' | 'not-found' | 'ready' | 'confirmed'>('loading');
	event = signal<PublicEvent | null>(null);
	// Elegido a mano por el comprador en tenants no-CLUB (botones de ticket, paso 1) — en tenants
	// CLUB el ticket activo sale solo de attendeeTypeValue (ver activeTicket más abajo), este signal
	// queda sin usar en ese camino.
	selectedTicketId = signal<number | null>(null);
	selectedSeatIds = signal<Set<number>>(new Set());
	submitting = signal(false);
	errorMessage = signal('');
	purchasedTickets = signal<PurchasedSaleTicket[]>([]);

	// Espejo de registerForm.controls.attendeeType como signal — un FormControl no se puede leer
	// dentro de un computed() (no es reactivo para Angular), así que se mantiene sincronizado a mano
	// vía valueChanges (ver constructor).
	attendeeTypeValue = signal<AttendeeType | ''>('');

	// En tenants CLUB, el ticket lo define automáticamente la respuesta a "¿Sos socio o invitado?"
	// (ver 1. Tus datos) — el comprador nunca elige un ticket a mano ahí. En el resto, sigue siendo
	// el que se clickeó en el paso 1.
	activeTicket = computed(() => {
		const ev = this.event();
		if (!ev) return null;
		if (ev.tenantType === 'CLUB') {
			const type = this.attendeeTypeValue();
			if (!type) return null;
			return ev.tickets.find((t) => t.attendeeType === type) ?? null;
		}
		return ev.tickets.find((t) => t.id === this.selectedTicketId()) ?? null;
	});
	activeTicketId = computed(() => this.activeTicket()?.id ?? null);

	// Un invitado no puede reservar más de MAX_INVITADO_SEATS asientos en una sola compra (ver
	// constante arriba) — cualquier otro caso usa el tope general.
	effectiveMaxSeats = computed(() => {
		const ev = this.event();
		if (ev?.tenantType === 'CLUB' && this.attendeeTypeValue() === 'INVITADO') {
			return MAX_INVITADO_SEATS;
		}
		return MAX_SEATS;
	});

	// seat.x/seat.y se guardaron en píxeles del tamaño NATURAL de la imagen (así los posiciona el
	// editor del manager, que renderiza la imagen sin escalar). Acá la imagen sí se achica para caber
	// en pantallas chicas (`max-width:100%`) — sin convertir a porcentaje, los asientos quedaban
	// anclados a coordenadas en px "de tamaño completo" mientras la imagen visible era mucho más
	// chica, y terminaban desparramados fuera del mapa. Se captura el tamaño natural al cargar cada
	// imagen y se posiciona todo en % de ese tamaño, así escala junto con la imagen sin importar el
	// viewport.
	imgSizes = signal<Record<number, { w: number; h: number }>>({});

	onImageLoad(areaId: number, event: Event) {
		const img = event.target as HTMLImageElement;
		this.imgSizes.update((sizes) => ({ ...sizes, [areaId]: { w: img.naturalWidth, h: img.naturalHeight } }));
	}

	// Con muchos asientos agrupados en mesas, mostrar cada silla como un punto individual sobre el
	// plano es difícil de tocar con el dedo y poco amigable para alguien que no conoce el sistema —
	// en vez de eso, la mesa entera es el botón sobre el mapa; tocarla abre un panel con sus asientos
	// como pastillas grandes (verde disponible / gris ocupado / rojo ya elegido), igual paleta que
	// usa el manager en su propio editor de mapa.
	expandedTableId = signal<number | null>(null);

	ungroupedSeats(area: PublicArea): PublicSeat[] {
		return area.seats.filter((s) => !s.tableId);
	}

	// El orden que devuelve la API es el de inserción en la base, no el número de mesa — sin esto
	// "Mesa 1" podía terminar apareciendo al final de la lista.
	sortedTables(area: PublicArea) {
		return [...area.tables].sort((a, b) => this.seatNumber(a.name) - this.seatNumber(b.name));
	}

	seatsForTable(area: PublicArea, tableId: number): PublicSeat[] {
		return area.seats
			.filter((s) => s.tableId === tableId)
			.sort((a, b) => this.seatNumber(a.name) - this.seatNumber(b.name));
	}

	private seatNumber(name: string): number {
		const match = name.match(/(\d+)$/);
		return match ? Number(match[1]) : 0;
	}

	tableAvailableCount(area: PublicArea, tableId: number): number {
		return this.seatsForTable(area, tableId).filter((s) => s.available).length;
	}

	tableSelectedCount(area: PublicArea, tableId: number): number {
		return this.seatsForTable(area, tableId).filter((s) => this.selectedSeatIds().has(s.id)).length;
	}

	toggleTable(tableId: number) {
		this.expandedTableId.update((current) => (current === tableId ? null : tableId));
	}

	// Antes esto abría el panel igual aunque la mesa ya estuviera completa (el usuario solo veía
	// botones deshabilitados adentro) — ahora se avisa de una vez y ni se abre.
	onTableClick(area: PublicArea, tableId: number) {
		if (this.tableAvailableCount(area, tableId) === 0) {
			warning('Esta mesa no tiene asientos disponibles.', 'Mesa completa');
			return;
		}
		this.toggleTable(tableId);
	}

	// El ticket solo desbloquea la(s) área(s) que su vendedor le asignó (areaId en el ticket) —
	// si no tiene área asignada, mantiene el comportamiento anterior de mostrar todas.
	visibleAreas(ev: PublicEvent): PublicArea[] {
		const areas = ev.map?.areas ?? [];
		const ticket = this.activeTicket();
		if (!ticket?.areaId) return areas;
		return areas.filter((a) => a.id === ticket.areaId);
	}

	expandedTableSeats = computed(() => {
		const tableId = this.expandedTableId();
		const ev = this.event();
		if (!tableId || !ev?.map) return null;
		for (const area of ev.map.areas) {
			const table = area.tables.find((t) => t.id === tableId);
			if (table) return { table, seats: this.seatsForTable(area, tableId) };
		}
		return null;
	});

	registerForm = this.fb.group({
		name: this.fb.control('', Validators.required),
		lastname: this.fb.control(''),
		email: this.fb.control('', [Validators.required, Validators.email]),
		phone: this.fb.control('', Validators.required),
		// Solo obligatorio para un socio de un tenant CLUB — se valida en submit() porque depende del
		// tipo de organización (viene con el evento) y de qué elige el comprador arriba.
		carnet: this.fb.control(''),
		attendeeType: this.fb.control<AttendeeType | ''>(''),
		sponsorCarnet: this.fb.control(''),
	});

	// Igual que attendeeError en create-qr-modal: validación rápida en el cliente antes de mandar al
	// backend, que es la fuente de verdad real (ver api/src/lib/attendee.ts).
	attendeeError = signal('');

	constructor() {
		this.registerForm.controls.attendeeType.valueChanges.subscribe((value) => {
			this.attendeeTypeValue.set(value ?? '');
			// Cambiar de socio a invitado (o viceversa) cambia el ticket activo y, con él, qué áreas y
			// qué tope de asientos aplican — una selección hecha bajo el tipo anterior puede ya no ser
			// válida, así que arranca de cero en vez de arrastrar asientos que no correspondan.
			this.selectedSeatIds.set(new Set());
		});
	}

	ngOnInit(): void {
		const code = this.route.snapshot.paramMap.get('code');
		if (!code) {
			this.step.set('not-found');
			return;
		}
		this.publicEventService.getEvent(code).subscribe({
			next: (event) => {
				this.event.set(event);
				// Sin preselección: la selección de asiento queda bloqueada hasta que el invitado
				// elija explícitamente un tipo de ticket, para que sepa a qué precio/tipo corresponde
				// el asiento que va a reservar.
				this.step.set('ready');
			},
			error: () => this.step.set('not-found'),
		});
	}

	isInvalid(name: keyof typeof this.registerForm.controls): boolean {
		const control = this.registerForm.controls[name];
		return control.invalid && control.touched;
	}

	seatLabel(item: { name: string }): string {
		return shortSeatLabel(item.name);
	}

	toggleSeat(seat: PublicSeat) {
		if (!seat.available) return;
		this.selectedSeatIds.update((current) => {
			const next = new Set(current);
			if (next.has(seat.id)) {
				next.delete(seat.id);
			} else if (next.size < this.effectiveMaxSeats()) {
				next.add(seat.id);
			}
			return next;
		});
	}

	formatDate(iso: string): string {
		// dateOn es un instante UTC medianoche que representa un día calendario — usar getters UTC
		// para no perder un día en timezones detrás de UTC (ver utils/dates.ts).
		return new Date(iso).toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
	}

	// startTime se guarda como "HH:mm" en 24h (ver create-event-modal) — acá se muestra en 12h con
	// AM/PM porque es lo que espera leer el invitado del picker público.
	formatStartTime(startTime: string): string {
		const [hoursStr, minutesStr] = startTime.split(':');
		const hours24 = Number(hoursStr);
		const minutes = Number(minutesStr);
		if (Number.isNaN(hours24) || Number.isNaN(minutes)) return startTime;
		const period = hours24 >= 12 ? 'PM' : 'AM';
		const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
		return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
	}

	submit(event: PublicEvent) {
		this.errorMessage.set('');
		this.attendeeError.set('');

		const { name, lastname, email, phone, carnet, attendeeType, sponsorCarnet } = this.registerForm.getRawValue();

		if (event.tenantType === 'CLUB') {
			if (!attendeeType) {
				this.attendeeError.set('Elegí si sos socio o invitado.');
				return;
			}
			if (!this.activeTicketId()) {
				this.attendeeError.set(`Este evento no tiene un ticket de ${attendeeType === 'SOCIO' ? 'socio' : 'invitado'} disponible — contactá a la organización.`);
				return;
			}
		} else if (!this.activeTicketId()) {
			this.errorMessage.set('Elegí un ticket.');
			return;
		}
		if (!this.selectedSeatIds().size) {
			this.errorMessage.set('Elegí al menos un asiento.');
			return;
		}
		if (this.registerForm.invalid) {
			this.registerForm.markAllAsTouched();
			this.errorMessage.set('Completá tus datos.');
			return;
		}

		if (event.tenantType === 'CLUB') {
			if (attendeeType === 'SOCIO' && !carnet?.trim()) {
				this.attendeeError.set('Ingresá tu carnet de socio.');
				return;
			}
			if (attendeeType === 'INVITADO' && !sponsorCarnet?.trim()) {
				this.attendeeError.set('Ingresá el carnet del socio que te invita.');
				return;
			}
		}

		this.submitting.set(true);
		this.publicEventService
			.purchase({
				eventCode: event.code,
				ticketId: this.activeTicketId()!,
				client: { name: name!, lastname: lastname!, email: email!, phone: phone!, carnet: carnet ?? '' },
				seatIds: Array.from(this.selectedSeatIds()),
				...(event.tenantType === 'CLUB' ? { attendeeType: attendeeType as AttendeeType, sponsorCarnet: sponsorCarnet ?? undefined } : {}),
			})
			.subscribe({
				next: (saleTickets) => {
					this.purchasedTickets.set(saleTickets);
					this.submitting.set(false);
					this.step.set('confirmed');
				},
				error: (err: HttpErrorResponse) => {
					this.submitting.set(false);
					this.errorMessage.set(extractErrorMessage(err));
				},
			});
	}
}
