import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { QRCodeComponent } from 'angularx-qrcode';
import { PublicEvent, PublicEventService, PublicSeat, PurchasedSaleTicket } from './services/public-event.service';
import { extractErrorMessage } from '../../utils/api-error';

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
							<p class="text-body-secondary">{{ formatDate(ev.dateOn) }}</p>
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
								@if (!ev.map || !ev.map.areas.length) {
									<p class="text-body-secondary">Este evento todavía no tiene asientos configurados.</p>
								}
								@for (area of ev.map?.areas ?? []; track area.id) {
									<div class="card mb-3">
										<div class="card-header">{{ area.name }}</div>
										<div class="card-body">
											@if (area.img) {
												<div class="seat-picker-image">
													<img [src]="area.img" class="seat-picker-bg" />
													@for (seat of area.seats; track seat.id) {
														<button
															type="button"
															class="seat-btn"
															[class.seat-taken]="!seat.available"
															[class.seat-selected]="selectedSeatIds().has(seat.id)"
															[disabled]="!seat.available"
															[style.top.px]="seat.y"
															[style.left.px]="seat.x"
															(click)="toggleSeat(seat)"
														>
															{{ seat.name }}
														</button>
													}
												</div>
											} @else {
												<div class="d-flex flex-wrap gap-2">
													@for (seat of area.seats; track seat.id) {
														<button
															type="button"
															class="btn btn-sm"
															[class.btn-secondary]="!seat.available"
															[class.btn-danger]="seat.available && selectedSeatIds().has(seat.id)"
															[class.btn-outline-danger]="seat.available && !selectedSeatIds().has(seat.id)"
															[disabled]="!seat.available"
															(click)="toggleSeat(seat)"
														>
															{{ seat.name }}
														</button>
													}
												</div>
											}
										</div>
									</div>
								}
							</div>

							<div class="mb-4">
								<h5>3. Tus datos</h5>
								<form [formGroup]="registerForm" class="row g-2">
									<div class="col-md-6">
										<input type="text" class="form-control" placeholder="Nombre" [class.is-invalid]="isInvalid('name')" formControlName="name" />
									</div>
									<div class="col-md-6">
										<input type="text" class="form-control" placeholder="Apellido" [class.is-invalid]="isInvalid('lastname')" formControlName="lastname" />
									</div>
									<div class="col-md-6">
										<input type="email" class="form-control" placeholder="Email" [class.is-invalid]="isInvalid('email')" formControlName="email" />
									</div>
									<div class="col-md-6">
										<input type="text" class="form-control" placeholder="Teléfono" [class.is-invalid]="isInvalid('phone')" formControlName="phone" />
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
				min-width: 32px;
				padding: 2px 6px;
				font-size: 11px;
				border-radius: 4px;
				border: 1px solid #dc3545;
				background: #1c1f24;
				color: #fff;
				cursor: pointer;
			}
			.seat-btn.seat-selected {
				background: #dc3545;
			}
			.seat-btn.seat-taken {
				background: #2a2a2a;
				border-color: #444;
				color: #666;
				cursor: not-allowed;
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

	step = signal<'loading' | 'not-found' | 'ready' | 'confirmed'>('loading');
	event = signal<PublicEvent | null>(null);
	selectedTicketId = signal<number | null>(null);
	selectedSeatIds = signal<Set<number>>(new Set());
	submitting = signal(false);
	errorMessage = signal('');
	purchasedTickets = signal<PurchasedSaleTicket[]>([]);

	registerForm = this.fb.group({
		name: this.fb.control('', Validators.required),
		lastname: this.fb.control('', Validators.required),
		email: this.fb.control('', [Validators.required, Validators.email]),
		phone: this.fb.control('', Validators.required),
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
				this.step.set('ready');
			},
			error: () => this.step.set('not-found'),
		});
	}

	isInvalid(name: keyof typeof this.registerForm.controls): boolean {
		const control = this.registerForm.controls[name];
		return control.invalid && control.touched;
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

		const { name, lastname, email, phone } = this.registerForm.getRawValue();
		this.submitting.set(true);
		this.publicEventService
			.purchase({
				eventCode: event.code,
				ticketId: this.selectedTicketId()!,
				client: { name: name!, lastname: lastname!, email: email!, phone: phone! },
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
