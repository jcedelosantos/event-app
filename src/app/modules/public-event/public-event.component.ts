import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { QRCodeComponent } from 'angularx-qrcode';
import { PublicArea, PublicEvent, PublicEventService, PublicSeat, PurchasedSaleTicket } from './services/public-event.service';
import { extractErrorMessage } from '../../utils/api-error';
import { shortSeatLabel } from '../../utils/seat-label';

const MAX_SEATS = 5;

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
									— {{ ev.startTime }}
								}
							</p>
							@if (ev.description) {
								<p>{{ ev.description }}</p>
							}

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
											[class.btn-outline-danger]="selectedTicketId() !== ticket.id"
											(click)="selectedTicketId.set(ticket.id)"
										>
											{{ ticket.name }} ({{ ticket.type }}) — {{ ticket.price }} USD
										</button>
									}
								</div>
							</div>

							<div class="mb-4">
								<div class="d-flex justify-content-between align-items-center mb-2">
									<h5 class="mb-0">2. Elegí tu(s) asiento(s)</h5>
									<span class="badge text-bg-danger">{{ selectedSeatIds().size }} / {{ maxSeats }}</span>
								</div>
								@if (!selectedTicketId()) {
									<p class="text-body-secondary">Elegí primero un tipo de ticket arriba para poder elegir tu(s) asiento(s).</p>
								} @else {
								@if (!ev.map || !ev.map.areas.length) {
									<p class="text-body-secondary">Este evento todavía no tiene asientos configurados.</p>
								}
								@for (area of ev.map?.areas ?? []; track area.id) {
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
																(click)="toggleTable(table.id)"
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
								<div class="table-overlay-backdrop" (click)="expandedTableId.set(null)">
									<div class="table-overlay-panel" (click)="$event.stopPropagation()">
										<div class="d-flex justify-content-between align-items-center mb-3">
											<h6 class="mb-0">{{ info.table.name }}</h6>
											<button type="button" class="btn-close btn-close-white" aria-label="Cerrar" (click)="expandedTableId.set(null)"></button>
										</div>
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
										<div class="d-flex gap-3 small text-body-secondary">
											<span><span class="legend-dot" style="background:#28a745"></span> Disponible</span>
											<span><span class="legend-dot" style="background:#6c757d"></span> Ocupado</span>
											<span><span class="legend-dot" style="background:var(--app-accent)"></span> Elegido</span>
										</div>
									</div>
								</div>
							}

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
									<div class="col-md-6">
										<input type="text" class="form-control" placeholder="Carnet / Cédula" [class.is-invalid]="isInvalid('carnet')" formControlName="carnet" />
									</div>
								</form>
							</div>

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
	selectedTicketId = signal<number | null>(null);
	selectedSeatIds = signal<Set<number>>(new Set());
	submitting = signal(false);
	errorMessage = signal('');
	purchasedTickets = signal<PurchasedSaleTicket[]>([]);

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
		carnet: this.fb.control('', Validators.required),
	});

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
			} else if (next.size < MAX_SEATS) {
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

	submit(event: PublicEvent) {
		this.errorMessage.set('');

		if (!this.selectedTicketId()) {
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

		const { name, lastname, email, phone, carnet } = this.registerForm.getRawValue();
		this.submitting.set(true);
		this.publicEventService
			.purchase({
				eventCode: event.code,
				ticketId: this.selectedTicketId()!,
				client: { name: name!, lastname: lastname!, email: email!, phone: phone!, carnet: carnet! },
				seatIds: Array.from(this.selectedSeatIds()),
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
