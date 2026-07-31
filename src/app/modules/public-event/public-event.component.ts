import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { QRCodeComponent } from 'angularx-qrcode';
import { AttendeeType, CheckoutHoldInput, PublicArea, PublicEvent, PublicEventService, PublicSeat, PurchasedChild, PurchasedSaleTicket } from './services/public-event.service';
import { extractErrorMessage } from '../../utils/api-error';
import { shortSeatLabel } from '../../utils/seat-label';
import { warning } from '../../utils/messages';

// Formato real del carnet (ver create-qr-modal / lib/attendee.ts): una letra (inicial del primer
// apellido) + 4 dígitos para el socio accionista — ej. "C6735". Los dependientes agregan "-N": "-0"
// para cónyuge, "-1"/"-2"/... para cada hijo en orden. Antes canPickSeats() solo chequeaba que el
// campo no estuviera vacío, así que un solo caracter ("c") ya destrababa el mapa de asientos — bug
// real reportado en producción.
const CARNET_PATTERN = /^[A-Za-z]\d{4}(-\d+)?$/;

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
				@case ('waiting-room') {
					<div class="waiting-room">
						<div class="waiting-room-badge">
							<span class="waiting-room-ring waiting-room-ring-1"></span>
							<span class="waiting-room-ring waiting-room-ring-2"></span>
							@if (waitingRoomTenantLogoUrl(); as logo) {
								<img [src]="logo" alt="" class="waiting-room-logo" />
							} @else {
								<div class="waiting-room-logo waiting-room-logo-fallback"><i class="bi bi-hourglass-split" aria-hidden="true"></i></div>
							}
						</div>
						@if (waitingRoomTenantName(); as name) {
							<div class="waiting-room-tenant">{{ name }}</div>
						}
						<h4 class="mt-2 mb-1">Estás en la fila</h4>
						@if (waitingRoomPosition(); as position) {
							<div class="waiting-room-position">#{{ position }}</div>
							<p class="text-body-secondary small mb-0">tu lugar en la fila</p>
						} @else {
							<p class="text-body-secondary">Ya casi te toca...</p>
						}
						<div class="waiting-room-dots" aria-hidden="true">
							<span></span><span></span><span></span>
						</div>
						<p class="text-body-secondary small waiting-room-hint">Esta pantalla se actualiza sola — no hace falta que recargues ni cierres la pestaña.</p>
					</div>
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
						@if (purchasedChildren().length; as childrenCount) {
							<h5 class="mt-4">Código de retiro de comida</h5>
							<p class="text-body-secondary small">
								Un solo código para toda la familia: al escanearlo se entrega la comida de {{ childrenCount === 1 ? 'tu hijo/a' : 'todos tus hijos' }} de una vez.
								Imprimilo o guardalo tantas veces como pulseras necesites (una por niño/a) — cualquier copia sirve.
							</p>
							<div class="card mb-3">
								<div class="card-body d-flex justify-content-between align-items-center">
									<div class="fw-bold">{{ childrenNamesLabel() }}</div>
									<qrcode [qrdata]="purchasedChildren()[0].codeQR" [width]="110" [errorCorrectionLevel]="'M'"></qrcode>
								</div>
							</div>
						}
					</div>
				}
				@case ('link-pending') {
					<div class="container py-4" style="max-width: 640px;">
						<h3>¡Ya casi, {{ registerForm.controls.name.value }}!</h3>
						<div class="alert alert-warning">
							Reservamos tu(s) asiento(s) por 15 minutos mientras completás el pago.
							@if (linkPendingInfo()?.linkUrl; as linkUrl) {
								<a [href]="linkUrl" target="_blank" rel="noopener" class="fw-bold d-block mt-2">{{ linkUrl }}</a>
							} @else {
								<div class="fw-bold mt-2">Coordiná el pago con la organización.</div>
							}
						</div>
						<p class="text-body-secondary">
							Total: {{ linkPendingInfo()?.totalUSD }} USD. En cuanto confirmemos tu pago te llega el código QR real a
							{{ registerForm.controls.email.value }}.
						</p>
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

							@if (purchaseBlockedReason(); as reason) {
								<div class="alert alert-warning">{{ reason }}</div>
							} @else {
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
								@if (duplicateEventBlockReason()) {
									<p class="text-danger">{{ duplicateEventBlockReason() }}</p>
								} @else if (sponsorBlocked()) {
									<p class="text-danger">{{ attendeeError() }}</p>
								} @else if (!canPickSeats()) {
									<p class="text-body-secondary">{{ seatsLockedMessage(ev) }}</p>
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

							@if (ev.tenantType === 'CHURCH' && !ev.payment) {
								<div class="mb-4">
									<div class="d-flex justify-content-between align-items-center mb-2">
										<h5 class="mb-0">4. ¿Venís con hijos?</h5>
										<button type="button" class="btn btn-sm btn-outline-danger" (click)="addChildDraft()">+ Agregar hijo/a</button>
									</div>
									@if (!childrenDraft().length) {
										<p class="text-body-secondary small">Si venís con hijos, agregalos acá para darles su código de retiro.</p>
									}
									@for (child of childrenDraft(); track $index) {
										<div class="row g-2 align-items-center mb-2">
											<div class="col-md-5">
												<input
													type="text"
													class="form-control"
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
													class="form-control"
													placeholder="Edad (opcional)"
													[value]="child.age"
													(input)="updateChildDraft($index, { age: $any($event.target).value })"
												/>
											</div>
											@if (ev.hasMealOfTheDay) {
												<div class="col-md-3 form-check">
													<input
														type="checkbox"
														class="form-check-input"
														[id]="'wantsMeal' + $index"
														[checked]="child.wantsMeal"
														(change)="updateChildDraft($index, { wantsMeal: $any($event.target).checked })"
													/>
													<label class="form-check-label small" [for]="'wantsMeal' + $index">¿Va a retirar la comida del día?</label>
												</div>
											}
											<div class="col-md-1">
												<button type="button" class="btn btn-sm btn-outline-secondary" (click)="removeChildDraft($index)">✕</button>
											</div>
										</div>
									}
								</div>
							}

							@if (errorMessage()) {
								<div class="alert alert-danger">{{ errorMessage() }}</div>
							}

							@if (ev.payment; as payment) {
								@if (payment.mode === 'PAYPAL' || payment.mode === 'BOTH') {
									<div class="mb-2">
										<div id="paypal-button-container"></div>
										@if (checkingOut()) {
											<p class="text-body-secondary small text-center mt-2">Procesando...</p>
										}
									</div>
								}
								@if (payment.mode === 'LINK' || payment.mode === 'BOTH') {
									<button type="button" class="pay-link-btn" [disabled]="checkingOut()" (click)="payByLink(ev)">
										<i class="bi bi-bank2" aria-hidden="true"></i>
										<span>{{ checkingOut() ? 'Procesando...' : 'Pagar por transferencia / link' }}</span>
									</button>
								}
							} @else {
								<button type="button" class="btn btn-danger btn-lg w-100" [disabled]="submitting()" (click)="submit(ev)">
									{{ submitting() ? 'Procesando...' : 'Confirmar y generar mis QR' }}
								</button>
							}
							}
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
				/* Un asiento muy cerca del borde del mapa (transform: translate(-50%,-50%)) puede
				   sobresalir un par de px fuera de su contenedor — sin esto, eso alcanza para que
				   TODA la página gane un scroll horizontal fantasma en mobile. */
				overflow-x: hidden;
			}
			.center-msg {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
			}
			.waiting-room {
				min-height: 100vh;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
				padding: 2rem 1.5rem;
			}
			.waiting-room-badge {
				position: relative;
				width: 96px;
				height: 96px;
				display: flex;
				align-items: center;
				justify-content: center;
				margin-bottom: 1.25rem;
			}
			.waiting-room-logo {
				position: relative;
				z-index: 1;
				width: 96px;
				height: 96px;
				border-radius: 50%;
				object-fit: cover;
				background: #16181d;
				border: 1px solid rgba(255, 255, 255, 0.1);
			}
			.waiting-room-logo-fallback {
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 2.25rem;
				color: var(--app-accent);
			}
			/* Dos anillos concéntricos que laten hacia afuera y se desvanecen (uno con 1.2s de delay) —
			   el mismo lenguaje visual de "esperando en vivo" que un radar/sonar, en el color de acento
			   del club en vez de una paleta genérica. */
			.waiting-room-ring {
				position: absolute;
				inset: 0;
				border-radius: 50%;
				border: 2px solid var(--app-accent);
				opacity: 0;
				animation: waiting-room-pulse 2.4s ease-out infinite;
			}
			.waiting-room-ring-2 {
				animation-delay: 1.2s;
			}
			@keyframes waiting-room-pulse {
				0% {
					transform: scale(0.82);
					opacity: 0.55;
				}
				100% {
					transform: scale(1.65);
					opacity: 0;
				}
			}
			.waiting-room-tenant {
				font-size: 0.75rem;
				font-weight: 600;
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: rgba(255, 255, 255, 0.55);
			}
			.waiting-room-position {
				font-size: 2.75rem;
				font-weight: 800;
				line-height: 1;
				margin: 0.5rem 0 0.25rem;
				font-variant-numeric: tabular-nums;
				color: var(--app-accent);
			}
			.waiting-room-dots {
				display: flex;
				gap: 6px;
				margin-top: 1.5rem;
			}
			.waiting-room-dots span {
				width: 8px;
				height: 8px;
				border-radius: 50%;
				background: var(--app-accent);
				animation: waiting-room-bounce 1.2s ease-in-out infinite;
			}
			.waiting-room-dots span:nth-child(2) {
				animation-delay: 0.15s;
			}
			.waiting-room-dots span:nth-child(3) {
				animation-delay: 0.3s;
			}
			@keyframes waiting-room-bounce {
				0%,
				80%,
				100% {
					transform: translateY(0);
					opacity: 0.4;
				}
				40% {
					transform: translateY(-6px);
					opacity: 1;
				}
			}
			.waiting-room-hint {
				max-width: 320px;
				margin-top: 1.5rem;
			}
			@media (prefers-reduced-motion: reduce) {
				.waiting-room-ring,
				.waiting-room-dots span {
					animation: none;
				}
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
				/* % (no px fijo) porque se posiciona en % del contenedor (seat-picker-image, ver arriba)
				   — así el círculo achica junto con la imagen en vez de quedar gigante/amontonado en
				   pantallas chicas (pasaba sobre todo en el plano genérico 900x600 sin foto real, que se
				   achica mucho más que su tamaño natural en un celular). clamp() evita que quede
				   ilegiblemente chico o más grande que la imagen misma. */
				width: clamp(14px, 2.6%, 24px);
				aspect-ratio: 1;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: clamp(7px, 1.1%, 10px);
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
				/* Mismo criterio que .seat-btn (ver comentario ahí) — % en vez de px fijo. */
				width: clamp(20px, 3.6%, 34px);
				aspect-ratio: 1;
				padding: 0;
				display: flex;
				align-items: center;
				justify-content: center;
				border-radius: 50%;
				border: 2px solid var(--app-accent);
				background: var(--app-accent);
				color: #fff;
				font-size: clamp(9px, 1.4%, 13px);
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
			/* Antes era un btn-outline-danger finito — al lado del bloque de botones de PayPal (que
			   el SDK renderiza grande, sólido y con esquinas redondeadas) se veía como una opción
			   secundaria de segunda clase en vez de un método de pago más. Mismo alto/peso visual que
			   el botón de PayPal, con su propio color (el acento del club) para no confundirlo con un
			   botón de PayPal real — es un método distinto (confirmación manual, no automática). */
			.pay-link-btn {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 0.5rem;
				width: 100%;
				padding: 0.9rem 1rem;
				border: none;
				border-radius: 0.5rem;
				background: var(--app-accent);
				color: #fff;
				font-size: 1.05rem;
				font-weight: 700;
				cursor: pointer;
			}
			.pay-link-btn:hover:not(:disabled) {
				filter: brightness(1.08);
			}
			.pay-link-btn:disabled {
				opacity: 0.65;
				cursor: not-allowed;
			}
			.pay-link-btn i {
				font-size: 1.2rem;
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
	private readonly destroyRef = inject(DestroyRef);

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

	step = signal<'loading' | 'waiting-room' | 'not-found' | 'ready' | 'confirmed' | 'link-pending'>('loading');
	event = signal<PublicEvent | null>(null);
	// Posición en la fila y branding del club mientras step() es 'waiting-room' (ver
	// enterEvent/startWaitingRoomPolling más abajo, y lib/waiting-room.ts del lado del servidor).
	waitingRoomPosition = signal<number | null>(null);
	waitingRoomTenantName = signal<string | null>(null);
	waitingRoomTenantLogoUrl = signal<string | null>(null);

	// --- Checkout con pago (Event.paymentMode) ---------------------------------------------------
	checkingOut = signal(false);
	linkPendingInfo = signal<{ linkUrl: string | null; totalUSD: number } | null>(null);
	private paypalButtonsRendered = false;

	// Único gatekeeper de "se puede comprar" — cubre tanto entrar por la portada de la organización
	// (que ya oculta/etiqueta estos casos) como entrar directo por un QR/link viejo que se saltea esa
	// pantalla: acá se bloquea la compra sin importar cómo llegó el comprador.
	purchaseBlockedReason = computed<string | null>(() => {
		const ev = this.event();
		if (!ev) return null;
		if (new Date() > new Date(ev.dateOff)) {
			return 'Las ventas para este evento ya cerraron.';
		}
		if (ev.publishAt && new Date() < new Date(ev.publishAt)) {
			const publishDate = new Date(ev.publishAt).toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' });
			return `Este evento estará disponible para la venta a partir del ${publishDate}.`;
		}
		if (!ev.tickets.length) {
			return 'Este evento todavía no está disponible para la venta — probá más adelante.';
		}
		if (ev.tickets.every((t) => t.count <= 0)) {
			return 'Este evento está agotado — ya no hay entradas disponibles.';
		}
		return null;
	});
	// Elegido a mano por el comprador en tenants no-CLUB (botones de ticket, paso 1) — en tenants
	// CLUB el ticket activo sale solo de attendeeTypeValue (ver activeTicket más abajo), este signal
	// queda sin usar en ese camino.
	selectedTicketId = signal<number | null>(null);
	selectedSeatIds = signal<Set<number>>(new Set());
	submitting = signal(false);
	errorMessage = signal('');
	purchasedTickets = signal<PurchasedSaleTicket[]>([]);
	purchasedChildren = signal<PurchasedChild[]>([]);
	// Todos los hijos de esta compra comparten el mismo codeQR familiar (ver public.ts) — se
	// muestran juntos en un solo card en vez de uno por hijo.
	childrenNamesLabel = computed(() => this.purchasedChildren().map((c) => c.name).join(', '));

	// Borrador de hijos a registrar junto con la compra — solo se muestra/manda en tenants CHURCH (ver
	// "4. ¿Venís con hijos?"). Plano con signal en vez de un FormArray reactivo: no hay otro precedente
	// de FormArray en este codebase y una lista chica como esta no lo necesita.
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
		// tipo de organización (viene con el evento) y de qué elige el comprador arriba. El pattern sí
		// se chequea siempre que haya contenido (ver CARNET_PATTERN) para que isInvalid() marque un
		// carnet incompleto/mal tipeado en rojo apenas el campo pierde foco.
		carnet: this.fb.control('', Validators.pattern(CARNET_PATTERN)),
		attendeeType: this.fb.control<AttendeeType | ''>(''),
		sponsorCarnet: this.fb.control(''),
	});

	// Igual que attendeeError en create-qr-modal: validación rápida en el cliente antes de mandar al
	// backend, que es la fuente de verdad real (ver api/src/lib/attendee.ts).
	attendeeError = signal('');

	// Motivo por el que el socio ingresado como sponsorCarnet no habilita elegir asiento, o null si
	// está OK — se chequea apenas se completa el carnet (ver constructor), ANTES de dejar elegir
	// asiento, para no hacerle armar toda la selección a alguien que igual va a ser rechazado al
	// confirmar. Se guarda el motivo (no solo un booleano) para poder mostrar el mismo mensaje
	// específico también si el submit llega a dispararse antes de que termine este chequeo.
	sponsorBlockReason = signal<'not-registered' | 'max-reached' | null>(null);
	sponsorBlocked = computed(() => this.sponsorBlockReason() !== null);

	// Motivo por el que esta persona (email o carnet) ya está registrada en otra fecha vinculada del
	// mismo evento — se chequea apenas se completan email/carnet, ANTES de dejar elegir asiento (ver
	// constructor y checkDuplicateEventStatus). null = no hay bloqueo.
	duplicateEventBlockReason = signal<string | null>(null);

	// True solo cuando el carnet del socio que invita ya fue chequeado contra el backend y quedó
	// habilitado (registrado + no llegó al tope) — hasta entonces la selección de asientos queda
	// bloqueada, aunque el ticket ya se haya auto-resuelto por attendeeType. Se resetea a false apenas
	// el carnet cambia (antes de que el debounce dispare el chequeo de nuevo), para que nunca quede
	// "confirmado" un carnet viejo mientras se escribe uno nuevo.
	sponsorConfirmed = signal(false);

	constructor() {
		this.registerForm.controls.attendeeType.valueChanges.subscribe((value) => {
			this.attendeeTypeValue.set(value ?? '');
			// Cambiar de socio a invitado (o viceversa) cambia el ticket activo y, con él, qué áreas y
			// qué tope de asientos aplican — una selección hecha bajo el tipo anterior puede ya no ser
			// válida, así que arranca de cero en vez de arrastrar asientos que no correspondan.
			this.selectedSeatIds.set(new Set());
			this.sponsorBlockReason.set(null);
			this.sponsorConfirmed.set(false);
			this.attendeeError.set('');
		});

		this.registerForm.controls.sponsorCarnet.valueChanges.subscribe(() => {
			this.sponsorConfirmed.set(false);
		});

		this.registerForm.controls.sponsorCarnet.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe((carnet) => {
			this.checkSponsorStatus(carnet);
		});

		this.registerForm.controls.email.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
			this.duplicateEventBlockReason.set(null);
			this.checkDuplicateEventStatus();
		});
		this.registerForm.controls.carnet.valueChanges.pipe(debounceTime(400), distinctUntilChanged()).subscribe(() => {
			this.duplicateEventBlockReason.set(null);
			this.checkDuplicateEventStatus();
		});
	}

	sponsorBlockMessage(carnet: string): string {
		return this.sponsorBlockReason() === 'not-registered'
			? `Socio ${carnet} aún no está registrado en este evento.`
			: `El socio ${carnet} ya alcanzó su máximo de invitados para este evento.`;
	}

	// Gatekeeper único de "2. Elegí tu(s) asiento(s)": para un tenant CLUB no alcanza con haber
	// elegido socio/invitado (eso solo resuelve el ticket) — un invitado necesita el carnet del socio
	// ya CONFIRMADO contra el backend, y un socio necesita sus datos de contacto + su propio carnet
	// completos. Antes de este chequeo, elegir "Soy invitado" ya destrababa el mapa de asientos sin
	// haber cargado carnet ni datos — bug real reportado en producción.
	canPickSeats(): boolean {
		const ev = this.event();
		if (!ev || !this.activeTicketId()) return false;
		if (this.duplicateEventBlockReason()) return false;
		if (ev.tenantType !== 'CLUB') return true;

		const type = this.attendeeTypeValue();
		if (!type) return false;

		const contactFilled = !this.registerForm.controls.name.invalid && !this.registerForm.controls.email.invalid && !this.registerForm.controls.phone.invalid;
		if (!contactFilled) return false;

		if (type === 'SOCIO') {
			return this.isValidCarnet(this.registerForm.controls.carnet.value);
		}
		return this.sponsorConfirmed();
	}

	private isValidCarnet(value: string | null | undefined): boolean {
		return !!value && CARNET_PATTERN.test(value.trim());
	}

	// Mensaje que explica por qué "2. Elegí tu(s) asiento(s)" sigue bloqueado — un solo lugar para
	// toda la lógica de qué falta, en el mismo orden que valida canPickSeats().
	seatsLockedMessage(ev: PublicEvent): string {
		if (this.duplicateEventBlockReason()) {
			return this.duplicateEventBlockReason()!;
		}
		if (ev.tenantType !== 'CLUB') {
			return 'Elegí primero un tipo de ticket arriba para poder elegir tu(s) asiento(s).';
		}
		const type = this.attendeeTypeValue();
		if (!type) {
			return 'Completá tus datos arriba (decinos si sos socio o invitado) para poder elegir tu(s) asiento(s).';
		}
		if (!this.activeTicketId()) {
			return `Este evento no tiene un ticket de ${type === 'SOCIO' ? 'socio' : 'invitado'} disponible — contactá a la organización.`;
		}
		const contactFilled = !this.registerForm.controls.name.invalid && !this.registerForm.controls.email.invalid && !this.registerForm.controls.phone.invalid;
		if (!contactFilled) {
			return 'Completá tu nombre, email y teléfono arriba para poder elegir tu(s) asiento(s).';
		}
		if (type === 'SOCIO') {
			const carnet = this.registerForm.controls.carnet.value?.trim();
			if (carnet && !this.isValidCarnet(carnet)) {
				return 'El carnet no tiene el formato correcto (ej. C6735, o C6735-0 para tu cónyuge/hijos).';
			}
			return 'Ingresá tu carnet de socio arriba para poder elegir tu(s) asiento(s).';
		}
		return 'Ingresá el carnet del socio que te invita para poder elegir tu(s) asiento(s).';
	}

	private checkSponsorStatus(carnet: string | null) {
		this.sponsorBlockReason.set(null);
		this.sponsorConfirmed.set(false);
		this.attendeeError.set('');
		const ev = this.event();
		const trimmed = carnet?.trim();
		if (!ev || this.attendeeTypeValue() !== 'INVITADO' || !trimmed) return;

		this.publicEventService.getSponsorStatus(ev.code, trimmed).subscribe({
			next: (status) => {
				// Un invitado no puede "entrar solo" — el socio que lo invita tiene que tener su propia
				// entrada ya comprada para este evento, chequeado antes que el tope de invitados.
				if (!status.registered) {
					this.sponsorBlockReason.set('not-registered');
					this.selectedSeatIds.set(new Set());
				} else if (status.blocked) {
					this.sponsorBlockReason.set('max-reached');
					this.selectedSeatIds.set(new Set());
				} else {
					this.sponsorConfirmed.set(true);
				}
				if (this.sponsorBlockReason()) {
					this.attendeeError.set(this.sponsorBlockMessage(trimmed));
				}
			},
			// Silencioso: si el chequeo preventivo falla (red, etc.) no bloqueamos por las dudas — el
			// submit real vuelve a validar esto igual, así que nunca se cuela una reserva de más.
			error: () => {},
		});
	}

	private checkDuplicateEventStatus() {
		const ev = this.event();
		const email = this.registerForm.controls.email.value?.trim();
		const carnet = this.registerForm.controls.carnet.value?.trim() ?? '';
		if (!ev || ev.tenantType !== 'CLUB' || !email || this.registerForm.controls.email.invalid) return;

		this.publicEventService.getDuplicateEventStatus(ev.code, email, carnet).subscribe({
			next: (status) => {
				if (status.blocked && status.reason) {
					this.duplicateEventBlockReason.set(status.reason);
					this.selectedSeatIds.set(new Set());
				}
			},
			// Silencioso por la misma razón que checkSponsorStatus: el submit real (y el backend) vuelven
			// a validar esto igual, así que un chequeo preventivo que falla no puede colar una reserva.
			error: () => {},
		});
	}

	ngOnInit(): void {
		const code = this.route.snapshot.paramMap.get('code');
		if (!code) {
			this.step.set('not-found');
			return;
		}
		this.enterEvent(code);
	}

	// Gate de sala de espera virtual (opt-in por evento, ver Event.waitingRoomEnabled) — se llama
	// ANTES de loadEvent() para que la gente en cola no dispare nunca la query pesada de
	// GET /events/:code mientras espera. Si el evento no la tiene prendida, `enabled` viene en false
	// y esto sigue directo a loadEvent() — cero cambio de comportamiento para el resto de los eventos.
	private enterEvent(code: string): void {
		const sessionId = this.waitingRoomSessionId(code);
		this.publicEventService.joinWaitingRoom(code, sessionId).subscribe({
			next: (result) => {
				if (!result.enabled || result.admitted) {
					this.loadEvent(code);
					return;
				}
				this.waitingRoomPosition.set(result.position);
				this.waitingRoomTenantName.set(result.tenantName);
				this.waitingRoomTenantLogoUrl.set(result.tenantLogoUrl);
				this.step.set('waiting-room');
				this.startWaitingRoomPolling(code, sessionId);
			},
			// Fail-open: si el endpoint nuevo falla (caída puntual, timeout), seguir al flujo normal en
			// vez de dejar a alguien bloqueado por una sala de espera que ni siquiera pudo consultarse.
			error: () => this.loadEvent(code),
		});
	}

	// sessionStorage (no localStorage): sobrevive un refresh de la pestaña sin perder el lugar en la
	// fila, pero una pestaña nueva arranca de cero — cada visitante real cuenta una sola vez, y dos
	// pestañas duplicadas del mismo visitante (Cmd+clic en recargar) terminan compartiendo sessionId,
	// que es lo correcto (misma persona, mismo lugar en la fila — ver lib/waiting-room.ts).
	private waitingRoomSessionId(code: string): string {
		const key = `waitingRoomSessionId:${code}`;
		let sessionId = sessionStorage.getItem(key);
		if (!sessionId) {
			sessionId = crypto.randomUUID();
			sessionStorage.setItem(key, sessionId);
		}
		return sessionId;
	}

	private startWaitingRoomPolling(code: string, sessionId: string): void {
		const intervalId = setInterval(() => {
			this.publicEventService.getWaitingRoomStatus(code, sessionId).subscribe({
				next: (result) => {
					if (!result.enabled || result.admitted) {
						clearInterval(intervalId);
						this.loadEvent(code);
						return;
					}
					this.waitingRoomPosition.set(result.position);
				},
				// Si un poll puntual falla, no sacar a nadie de la sala de espera del lado cliente —
				// simplemente se reintenta en el próximo tick (el backend poda por inactividad si de
				// verdad se fue).
				error: () => {},
			});
		}, 4000);
		this.destroyRef.onDestroy(() => clearInterval(intervalId));
	}

	private loadEvent(code: string): void {
		this.publicEventService.getEvent(code).subscribe({
			next: (event) => {
				this.event.set(event);
				// Sin preselección: la selección de asiento queda bloqueada hasta que el invitado
				// elija explícitamente un tipo de ticket, para que sepa a qué precio/tipo corresponde
				// el asiento que va a reservar.
				this.step.set('ready');
				if (event.payment?.paypalClientId && (event.payment.mode === 'PAYPAL' || event.payment.mode === 'BOTH')) {
					this.ensurePaypalButtons(event);
				}
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

		if (this.purchaseBlockedReason()) {
			this.errorMessage.set(this.purchaseBlockedReason()!);
			return;
		}
		if (this.duplicateEventBlockReason()) {
			this.attendeeError.set(this.duplicateEventBlockReason()!);
			return;
		}

		const { name, lastname, email, phone, carnet, attendeeType, sponsorCarnet } = this.registerForm.getRawValue();

		if (event.tenantType === 'CLUB') {
			if (!attendeeType) {
				this.attendeeError.set('Elegí si sos socio o invitado.');
				return;
			}
			if (this.sponsorBlocked()) {
				this.attendeeError.set(this.sponsorBlockMessage(sponsorCarnet?.trim() ?? ''));
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

		if (event.tenantType === 'CHURCH' && this.childrenDraft().some((c) => !c.name.trim())) {
			this.errorMessage.set('Completá el nombre de cada hijo/a agregado, o quitá la fila.');
			return;
		}

		this.submitting.set(true);
		this.publicEventService
			.purchase({
				eventCode: event.code,
				ticketId: this.activeTicketId()!,
				client: { name: name!, lastname: lastname!, email: email!, phone: phone!, carnet: carnet ?? '' },
				seatIds: Array.from(this.selectedSeatIds()),
				...(event.tenantType === 'CLUB' ? { attendeeType: attendeeType as AttendeeType, sponsorCarnet: sponsorCarnet ?? undefined } : {}),
				...(event.tenantType === 'CHURCH' && this.childrenDraft().length
					? {
							children: this.childrenDraft().map((c) => ({
								name: c.name.trim(),
								...(c.age.trim() ? { age: Number(c.age) } : {}),
								wantsMeal: c.wantsMeal,
							})),
						}
					: {}),
			})
			.subscribe({
				next: (result) => {
					this.purchasedTickets.set(result.saleTickets);
					this.purchasedChildren.set(result.children);
					this.submitting.set(false);
					this.step.set('confirmed');
				},
				error: (err: HttpErrorResponse) => {
					this.submitting.set(false);
					this.errorMessage.set(extractErrorMessage(err));
				},
			});
	}

	// --- Checkout con pago (Event.paymentMode) ----------------------------------------------------

	// Mismas validaciones que submit(), sin el chequeo de hijos (el checkout con pago no los soporta
	// en esta primera vuelta, ver CheckoutHoldInput) — se corre ANTES de reservar el asiento, para no
	// apartarlo con datos que el backend igual va a rechazar.
	private validateBeforeCheckout(event: PublicEvent): string | null {
		if (this.purchaseBlockedReason()) return this.purchaseBlockedReason();
		if (this.duplicateEventBlockReason()) return this.duplicateEventBlockReason();

		const { carnet, attendeeType, sponsorCarnet } = this.registerForm.getRawValue();
		if (event.tenantType === 'CLUB') {
			if (!attendeeType) return 'Elegí si sos socio o invitado.';
			if (this.sponsorBlocked()) return this.sponsorBlockMessage(sponsorCarnet?.trim() ?? '');
			if (!this.activeTicketId()) {
				return `Este evento no tiene un ticket de ${attendeeType === 'SOCIO' ? 'socio' : 'invitado'} disponible — contactá a la organización.`;
			}
		} else if (!this.activeTicketId()) {
			return 'Elegí un ticket.';
		}
		if (!this.selectedSeatIds().size) return 'Elegí al menos un asiento.';
		if (this.registerForm.invalid) {
			this.registerForm.markAllAsTouched();
			return 'Completá tus datos.';
		}
		if (event.tenantType === 'CLUB') {
			if (attendeeType === 'SOCIO' && !carnet?.trim()) return 'Ingresá tu carnet de socio.';
			if (attendeeType === 'INVITADO' && !sponsorCarnet?.trim()) return 'Ingresá el carnet del socio que te invita.';
		}
		return null;
	}

	private buildCheckoutHoldInput(event: PublicEvent, provider: 'PAYPAL' | 'LINK'): CheckoutHoldInput {
		const { name, lastname, email, phone, carnet, attendeeType, sponsorCarnet } = this.registerForm.getRawValue();
		return {
			eventCode: event.code,
			ticketId: this.activeTicketId()!,
			client: { name: name!, lastname: lastname!, email: email!, phone: phone!, carnet: carnet ?? '' },
			seatIds: Array.from(this.selectedSeatIds()),
			...(event.tenantType === 'CLUB' ? { attendeeType: attendeeType as AttendeeType, sponsorCarnet: sponsorCarnet ?? undefined } : {}),
			provider,
		};
	}

	// Opción "Link": aparta el/los asiento(s) igual que PayPal, pero sin pasar por ninguna pasarela —
	// el staff confirma el pago a mano desde el panel de QRs (ver sale-tickets.ts /mark-paid).
	payByLink(event: PublicEvent) {
		this.errorMessage.set('');
		const validation = this.validateBeforeCheckout(event);
		if (validation) {
			this.errorMessage.set(validation);
			return;
		}

		this.checkingOut.set(true);
		this.publicEventService.holdCheckout(this.buildCheckoutHoldInput(event, 'LINK')).subscribe({
			next: (hold) => {
				this.checkingOut.set(false);
				this.linkPendingInfo.set({ linkUrl: event.payment?.linkUrl ?? null, totalUSD: hold.totalUSD });
				this.step.set('link-pending');
			},
			error: (err: HttpErrorResponse) => {
				this.checkingOut.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}

	// Carga el SDK de PayPal (una sola vez) y renderiza los Smart Buttons en #paypal-button-container.
	// createOrder corre las mismas validaciones que submit()/payByLink justo antes de reservar el
	// asiento — si algo falta, cancela el checkout sin llegar a pegarle al backend.
	private ensurePaypalButtons(event: PublicEvent) {
		const clientId = event.payment?.paypalClientId;
		if (this.paypalButtonsRendered || !clientId) return;
		this.paypalButtonsRendered = true;

		const render = () => {
			const paypal = (window as any).paypal;
			if (!paypal) return;
			paypal
				.Buttons({
					createOrder: async () => {
						this.errorMessage.set('');
						const validation = this.validateBeforeCheckout(event);
						if (validation) {
							this.errorMessage.set(validation);
							throw new Error(validation);
						}
						this.checkingOut.set(true);
						const hold = await firstValueFrom(this.publicEventService.holdCheckout(this.buildCheckoutHoldInput(event, 'PAYPAL')));
						const order = await firstValueFrom(this.publicEventService.createPaypalOrder(hold.holdIds));
						return order.orderId;
					},
					onApprove: async (data: { orderID: string }) => {
						try {
							const result = await firstValueFrom(this.publicEventService.capturePaypalOrder(data.orderID));
							this.purchasedTickets.set(result.saleTickets);
							this.purchasedChildren.set([]);
							this.checkingOut.set(false);
							this.step.set('confirmed');
						} catch (err) {
							this.checkingOut.set(false);
							this.errorMessage.set(extractErrorMessage(err as HttpErrorResponse));
						}
					},
					onCancel: () => {
						this.checkingOut.set(false);
					},
					onError: (err: unknown) => {
						this.checkingOut.set(false);
						console.error('Error de PayPal:', err);
						// createOrder ya deja un mensaje específico (ej. "Elegí si sos socio o invitado")
						// y CANCELA el checkout tirando un Error a propósito — eso hace que el SDK de
						// PayPal dispare este mismo onError, que antes pisaba ese mensaje puntual con uno
						// genérico. Solo cae acá el genérico si de verdad no había ningún mensaje puesto
						// (un error real de PayPal, no una validación nuestra).
						if (!this.errorMessage()) {
							this.errorMessage.set('Hubo un problema con PayPal — intentá de nuevo.');
						}
					},
				})
				.render('#paypal-button-container');
		};

		if ((window as any).paypal) {
			render();
			return;
		}
		const existing = document.getElementById('paypal-sdk-script');
		if (existing) {
			existing.addEventListener('load', render, { once: true });
			return;
		}
		const script = document.createElement('script');
		script.id = 'paypal-sdk-script';
		script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD`;
		script.addEventListener('load', render, { once: true });
		document.body.appendChild(script);
	}
}
