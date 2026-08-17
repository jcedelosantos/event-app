import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Events } from '../../../../models/events/events';
import { EventsService } from '../services/events.service';
import { Map } from '../../../../models/maps/map';
import { MapsService } from '../../maps/services/maps.service';
import { QRService, SaleTicket } from '../../qrs/services/qr.service';
import { UpdateTicketModalComponent } from '../../tickets/components/update-ticket-modal/update-ticket-modal.component';
import { Ticket } from '../../../../models/tickets/ticket';
import { UpdateProductModalComponent } from '../../products/components/update-product-modal/update-product-modal.component';
import { Product } from '../../../../models/products/product';
import { UpdateGateModalComponent } from '../../access-points/components/update-gate-modal/update-gate-modal.component';
import { AccessPointsService } from '../../access-points/services/access-points.service';
import { AccessPoint } from '../../../../models/access-points/access-point';
import { ScanConflictsService } from '../../qrs/services/scan-conflicts.service';
import { ScanConflict } from '../../../../models/scan-conflicts/scan-conflict';
import { DatePipe } from '@angular/common';
import { centsToDollars } from '../../../../shared/money';

import { QRCodeComponent } from 'angularx-qrcode';
import { CardMapComponent } from '../../maps/components/card-map/card-map.component';
import { AuthService } from '../../../../core/services/auth.service';
import { PLAN_FEATURES } from '../../../../shared/pricing-plans';
import { isEventPlanCode } from '../../../../shared/event-plans';

declare const bootstrap: any;

@Component({
	selector: 'app-event-details',
	imports: [QRCodeComponent, CardMapComponent, FormsModule, RouterLink, UpdateTicketModalComponent, UpdateProductModalComponent, UpdateGateModalComponent, DatePipe],
	template: `
		@if (event(); as ev) {
			<h4 class="pb-2">
				{{ ev.name }}
			</h4>

			<div class="row">
				<div class="col-3">
					<div class="card">
						<div class="card-body">
							<div class="p-2 text-body-secondary">Tickets vendidos</div>
							<div class="p-2 fs-4">{{ soldCount() }}</div>
						</div>
					</div>
				</div>
				<div class="col-3">
					<div class="card">
						<div class="card-body">
							<div class="p-2 text-body-secondary">Ingresos</div>
							<div class="p-2 fs-4">{{ centsToDollars(revenue()) }} USD</div>
						</div>
					</div>
				</div>
				<div class="col-3">
					<div class="card">
						<div class="card-body">
							<div class="p-2 text-body-secondary">Cupo total</div>
							<div class="p-2 fs-4">{{ totalCount() }}</div>
						</div>
					</div>
				</div>
				<div class="col-3">
					<div class="card">
						<div class="card-body">
							<div class="p-2 text-body-secondary">Tipos de ticket</div>
							<div class="p-2 fs-4">{{ ev.tickets.length }}</div>
						</div>
					</div>
				</div>
			</div>
			@if (ev.overage; as overage) {
				<div class="alert alert-warning small d-flex justify-content-between align-items-center mt-3 mb-0">
					<span>
						<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
						Este evento superó el cupo incluido en tu plan: {{ overage.soldCount }} vendidas de {{ overage.included }} incluidas
						({{ overage.overageCount }} de excedente). El excedente se factura aparte al cierre.
					</span>
					<span class="fw-semibold text-nowrap ms-2">USD {{ centsToDollars(overage.overageCents) }}</span>
				</div>
			}
			<br />

			<div class="row">
				<div class="col-8">
					<div class="card">
						<div class="card-body">
							<h6>Detalles</h6>
							<p>{{ ev.description }}</p>
						</div>
					</div>
				</div>
				<div class="col-4 text-center">
					@if (publicPortalBlocked()) {
						<div class="alert alert-warning small text-start mb-2">
							<i class="bi bi-lock-fill" aria-hidden="true"></i>
							Tu plan actual no incluye portada pública — este link no va a cargar hasta que actualices a un plan Intermedio o superior.
						</div>
					}
					<qrcode [qrdata]="publicEventUrl(ev.code)" [width]="130" [errorCorrectionLevel]="'M'"></qrcode>
					<p class="small text-body-secondary mb-0">Compartí este QR o link para que el público se anote solo</p>
					<a [href]="publicEventUrl(ev.code)" target="_blank" class="small">{{ publicEventUrl(ev.code) }}</a>
				</div>
			</div>

			<br />

			<div class="row">
				@if (ev.map) {
					<div class="col-8">
						<card-map [map]="ev.map" />
						<a class="btn btn-outline-danger btn-sm mt-2" [routerLink]="['/manager/maps', ev.map.id, 'areas']">Configurar áreas de este mapa</a>
					</div>
				}

				<div class="col-4">
					<div class="card">
						<div class="card-body">
							<h5>Información</h5>
							<hr />

							<div class="row row-cols-2 g-2 kv-grid">
								<div class="col">
									<div class="text-body-secondary small">Creado</div>
									<div>{{ ev.dateSale | date: 'medium' }}</div>
								</div>
								<div class="col">
									<div class="text-body-secondary small">Visible</div>
									<div>{{ ev.active ? 'Sí' : 'No' }}</div>
								</div>
								<div class="col">
									<div class="text-body-secondary small">Inicio</div>
									<div>{{ ev.dateOn | date: 'mediumDate' : 'UTC' }}</div>
								</div>
								<div class="col">
									<div class="text-body-secondary small">Fin</div>
									<div>{{ ev.dateOff | date: 'mediumDate' : 'UTC' }}</div>
								</div>
								<div class="col">
									<div class="text-body-secondary small">Tipo</div>
									<div>{{ ev.type }}</div>
								</div>
							</div>
							<hr />

							<div class="d-flex flex-row mb-2 justify-content-between align-items-center">
								<div class="p-1">Estado del evento:</div>
								<div class="p-1 d-flex gap-2 align-items-center">
									<select class="form-select form-select-sm" [ngModel]="selectedStatus()" (ngModelChange)="selectedStatus.set($event)">
										<option value="ACTIVE">Activo</option>
										<option value="CANCELLED">Cancelado</option>
										<option value="POSTPONED">Pospuesto</option>
									</select>
									@if (selectedStatus() !== ev.status) {
										<button type="button" class="btn btn-danger btn-sm" (click)="saveStatus(ev.id)">Guardar</button>
									}
								</div>
							</div>
							@if (ev.status !== 'ACTIVE') {
								<p class="text-body-secondary small mb-2">
									Este evento sigue visible en el portal público, pero con la etiqueta correspondiente y sin poder comprarse.
								</p>
							}
							<hr />

							<div class="d-flex flex-row mb-2 justify-content-between align-items-center">
								<div class="p-1">Mapa:</div>
								<div class="p-1 d-flex gap-2 align-items-center">
									<select class="form-select form-select-sm" [ngModel]="selectedMapId()" (ngModelChange)="selectedMapId.set($event)">
										<option [ngValue]="null">Sin asignar</option>
										@for (map of maps(); track map.id) {
											<option [ngValue]="map.id">{{ map.name }}</option>
										}
									</select>
									@if (selectedMapId() !== (ev.map?.id ?? null)) {
										<button type="button" class="btn btn-danger btn-sm" (click)="saveMap(ev.id)">Guardar</button>
									}
								</div>
							</div>
							<hr />

							<div class="d-flex flex-row mb-2 justify-content-between align-items-center">
								<div class="p-1">Tickets:</div>
								<button type="button" class="btn btn-outline-danger btn-sm" (click)="openCreateTicketModal()"><i class="bi bi-plus-lg"></i> Ticket</button>
							</div>
							@if (!ev.tickets.length) {
								<p class="text-body-secondary small">Todavía no hay tickets para este evento.</p>
							} @else {
								@for (ticket of ev.tickets; track ticket.id) {
									<div class="d-flex justify-content-between">
										<span>{{ ticket.name }} ({{ ticket.type }})</span>
										<span>{{ centsToDollars(ticket.priceCents) }} USD</span>
									</div>
								}
							}
							<hr />

							<div class="d-flex flex-row mb-2 justify-content-between align-items-center">
								<div class="p-1">Productos:</div>
								<button type="button" class="btn btn-outline-danger btn-sm" (click)="openCreateProductModal()"><i class="bi bi-plus-lg"></i> Producto</button>
							</div>
							@if (!ev.products.length) {
								<p class="text-body-secondary small">Todavía no hay productos (goodies) para este evento.</p>
							} @else {
								@for (product of ev.products; track product.id) {
									<div class="d-flex justify-content-between">
										<span>{{ product.name }} ({{ product.type }}) x{{ product.count }}</span>
										<span>{{ centsToDollars(product.priceCents) }} USD</span>
									</div>
								}
							}
							<hr />

							<div class="d-flex flex-row mb-2 justify-content-between align-items-center">
								<div class="p-1">Puertas:</div>
								<button type="button" class="btn btn-outline-danger btn-sm" (click)="openCreateGateModal()"><i class="bi bi-plus-lg"></i> Puerta</button>
							</div>
							@if (!accessPoints().length) {
								<p class="text-body-secondary small">Sin puertas configuradas — el check-in de este evento no distingue por dónde entra la gente.</p>
							} @else {
								@for (gate of accessPoints(); track gate.id) {
									<div class="d-flex justify-content-between align-items-center">
										<span>{{ gate.name }} @if (!gate.active) {(inactiva)}</span>
										<button type="button" class="btn btn-link btn-sm p-0" (click)="openEditGateModal(gate)">Editar</button>
									</div>
								}
							}
						</div>
					</div>
				</div>
			</div>
			<hr />
			<div class="col-12">
				<h5>Compradores</h5>
				<br />
				<div class="card">
					<div class="card-body">
						@if (!sales().length) {
							<p class="text-body-secondary">Todavía no se ha vendido ningún ticket para este evento.</p>
						} @else {
							<table class="table table-striped-columns">
								<thead>
									<tr>
										<th scope="col">#</th>
										<th scope="col">Cliente</th>
										<th scope="col">Ticket</th>
										<th scope="col">Asiento</th>
										<th scope="col">Pago</th>
										<th scope="col">Precio</th>
									</tr>
								</thead>
								<tbody>
									@for (sale of sales(); track sale.id; let i = $index) {
										<tr>
											<th scope="row">{{ i + 1 }}</th>
											<td>{{ sale.client.name }} {{ sale.client.lastname }}</td>
											<td>{{ sale.ticket.name }}</td>
											<td>{{ sale.seat.name }}</td>
											<td>{{ sale.paidType }}</td>
											<td>{{ centsToDollars(sale.priceCents ?? sale.ticket.priceCents) }} USD</td>
										</tr>
									}
								</tbody>
							</table>
						}
					</div>
				</div>
			</div>

			@if (scanConflicts().length) {
				<hr />
				<div class="col-12">
					<h5>⚠ Conflictos de escaneo offline</h5>
					<p class="text-body-secondary small">
						Dos dispositivos sin conexión aprobaron el mismo QR antes de poder sincronizar — el sistema ya decidió cuál quedó como la entrada oficial (la más temprana). Esto es
						para que revises manualmente los casos que quedaron marcados como intento perdedor.
					</p>
					<div class="card">
						<div class="card-body">
							<table class="table table-striped-columns">
								<thead>
									<tr>
										<th scope="col">Quién</th>
										<th scope="col">Puerta</th>
										<th scope="col">Hora del intento</th>
										<th scope="col"></th>
									</tr>
								</thead>
								<tbody>
									@for (conflict of scanConflicts(); track conflict.id) {
										<tr>
											<td>{{ conflict.summary }}</td>
											<td>{{ conflict.accessPoint?.name ?? '—' }}</td>
											<td>{{ conflict.attemptedAt | date: 'short' }}</td>
											<td class="text-end">
												<button type="button" class="btn btn-outline-secondary btn-sm" (click)="resolveConflict(conflict)">Marcar revisado</button>
											</td>
										</tr>
									}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			}

			<app-update-ticket-modal [(ticket)]="ticketToEdit" [defaultEventId]="ev.id" (ticketSaved)="onTicketSaved()" />
			<app-update-product-modal [(product)]="productToEdit" [defaultEventId]="ev.id" (productSaved)="onProductSaved()" />
			<app-update-gate-modal [(gate)]="gateToEdit" [defaultEventId]="ev.id" [availableTickets]="ev.tickets" (gateSaved)="onGateSaved()" />
		} @else {
			<p>Cargando evento...</p>
		}
	`,
	styleUrl: './event-details.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailsComponent implements OnInit {
	private readonly activatedRoute = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly eventSrv = inject(EventsService);
	private readonly mapsService = inject(MapsService);
	private readonly qrService = inject(QRService);
	private readonly accessPointsService = inject(AccessPointsService);
	private readonly scanConflictsService = inject(ScanConflictsService);
	private readonly authService = inject(AuthService);
	readonly centsToDollars = centsToDollars;

	event = signal<Events | null>(null);
	maps = signal<Map[]>([]);
	selectedMapId = signal<number | null>(null);
	selectedStatus = signal<'ACTIVE' | 'CANCELLED' | 'POSTPONED'>('ACTIVE');
	allSales = signal<SaleTicket[]>([]);
	ticketToEdit = signal<Ticket | null>(null);
	productToEdit = signal<Product | null>(null);
	accessPoints = signal<AccessPoint[]>([]);
	gateToEdit = signal<AccessPoint | null>(null);
	scanConflicts = signal<ScanConflict[]>([]);

	sales = computed(() => {
		const ev = this.event();
		if (!ev) return [];
		return this.allSales().filter((sale) => sale.eventId === ev.id);
	});

	// El QR/link de acá abajo apuntan a la misma página pública que el link de Settings — sujeta al
	// mismo bloqueo por plan (ver public.ts GET /events/:code). Mismo criterio que
	// settings.component.ts: se avisa acá en vez de tocar la respuesta pública, para no romper el
	// anti-enumeration (un tenant Básico responde 404 genérico, no un mensaje de "necesitas upgrade").
	publicPortalBlocked = computed(() => {
		const plan = this.authService.currentUser()?.tenant?.plan;
		if (!plan || isEventPlanCode(plan)) return false;
		return !PLAN_FEATURES[plan]?.publicPortal;
	});

	soldCount = computed(() => this.sales().length);
	// Centavos enteros — se convierte a dólares recién en el template.
	revenue = computed(() => this.sales().reduce((sum, sale) => sum + (sale.priceCents ?? sale.ticket?.priceCents ?? 0), 0));
	totalCount = computed(() => this.event()?.tickets.reduce((sum, ticket) => sum + ticket.count, 0) ?? 0);

	ngOnInit(): void {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
		this.qrService.getQRs().subscribe((sales) => this.allSales.set(sales));

		this.activatedRoute.paramMap.subscribe((params) => {
			const id = params.get('id_event');
			if (!id || Number.isNaN(Number(id))) {
				this.router.navigate(['/manager/events']);
				return;
			}
			this.eventSrv.getEvent(Number(id)).subscribe({
				next: (event) => {
					this.event.set(event);
					this.selectedMapId.set(event.map?.id ?? null);
					this.selectedStatus.set(event.status);
					this.loadAccessPoints(event.id);
					this.loadScanConflicts(event.id);
				},
				error: () => this.router.navigate(['/manager/events']),
			});
		});
	}

	loadAccessPoints(eventId: number) {
		this.accessPointsService.getByEvent(eventId).subscribe((accessPoints) => this.accessPoints.set(accessPoints));
	}

	loadScanConflicts(eventId: number) {
		this.scanConflictsService.getByEvent(eventId).subscribe((conflicts) => this.scanConflicts.set(conflicts));
	}

	resolveConflict(conflict: ScanConflict) {
		this.scanConflictsService.resolve(conflict.id).subscribe(() => this.scanConflicts.update((list) => list.filter((c) => c.id !== conflict.id)));
	}

	publicEventUrl(code: string): string {
		return `${window.location.origin}/e/${code}`;
	}

	saveMap(eventId: number) {
		this.eventSrv.updateEvent(eventId, { mapId: this.selectedMapId() }).subscribe((event) => this.event.set(event));
	}

	saveStatus(eventId: number) {
		this.eventSrv.updateEvent(eventId, { status: this.selectedStatus() }).subscribe((event) => {
			this.event.set(event);
			this.selectedStatus.set(event.status);
		});
	}

	openCreateTicketModal() {
		this.ticketToEdit.set(null);
		const modalEl = document.getElementById('updateTicketModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onTicketSaved() {
		const ev = this.event();
		if (!ev) return;
		this.eventSrv.getEvent(ev.id).subscribe((event) => this.event.set(event));
	}

	openCreateProductModal() {
		this.productToEdit.set(null);
		const modalEl = document.getElementById('updateProductModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onProductSaved() {
		const ev = this.event();
		if (!ev) return;
		this.eventSrv.getEvent(ev.id).subscribe((event) => this.event.set(event));
	}

	openCreateGateModal() {
		this.gateToEdit.set(null);
		const modalEl = document.getElementById('updateGateModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	openEditGateModal(gate: AccessPoint) {
		this.gateToEdit.set(gate);
		const modalEl = document.getElementById('updateGateModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onGateSaved() {
		const ev = this.event();
		if (!ev) return;
		this.loadAccessPoints(ev.id);
	}
}
