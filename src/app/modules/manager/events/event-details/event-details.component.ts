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

import { QRCodeComponent } from 'angularx-qrcode';
import { CardMapComponent } from '../../maps/components/card-map/card-map.component';

declare const bootstrap: any;

@Component({
	selector: 'app-event-details',
	imports: [QRCodeComponent, CardMapComponent, FormsModule, RouterLink, UpdateTicketModalComponent, UpdateProductModalComponent],
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
							<div class="p-2 fs-4">{{ revenue() }} USD</div>
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
			<br />

			<div class="row">
				<div class="col-8">
					<div class="card">
						<div class="card-body">
							<h6>Details</h6>
							<p>{{ ev.description }}</p>
						</div>
					</div>
				</div>
				<div class="col-4 text-center">
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
							<h5>Information</h5>
							<hr />

							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-1">Created</div>
								<div class="p-1">{{ ev.dateSale.toISOString() }}</div>
							</div>
							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-1">Start</div>
								<div class="p-1">{{ ev.dateOn.toISOString() }}</div>
							</div>
							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-1">End</div>
								<div class="p-1">{{ ev.dateOff.toISOString() }}</div>
							</div>
							<hr />

							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-2">Status</div>
								<div class="p-2">{{ ev.active }}</div>
							</div>
							<hr />

							<div class="d-flex flex-row mb-3 justify-content-between">
								<div class="p-1">Type</div>
								<div class="p-1">{{ ev.type }}</div>
							</div>

							<div class="d-flex flex-row mb-3 justify-content-between align-items-center">
								<div class="p-1">Map:</div>
								<div class="p-1 d-flex gap-2 align-items-center">
									<select class="form-select form-select-sm" [ngModel]="selectedMapId()" (ngModelChange)="selectedMapId.set($event)">
										<option [ngValue]="null">Sin asignar</option>
										@for (map of maps(); track map.id) {
											<option [ngValue]="map.id">{{ map.name }}</option>
										}
									</select>
									@if (selectedMapId() !== (ev.map?.id ?? null)) {
										<button type="button" class="btn btn-danger btn-sm" (click)="saveMap(ev.id)">Save</button>
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
										<span>{{ ticket.price }} USD</span>
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
										<span>{{ product.price }} USD</span>
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
											<td>{{ sale.ticket.price }} USD</td>
										</tr>
									}
								</tbody>
							</table>
						}
					</div>
				</div>
			</div>

			<app-update-ticket-modal [(ticket)]="ticketToEdit" [defaultEventId]="ev.id" (ticketSaved)="onTicketSaved()" />
			<app-update-product-modal [(product)]="productToEdit" [defaultEventId]="ev.id" (productSaved)="onProductSaved()" />
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

	event = signal<Events | null>(null);
	maps = signal<Map[]>([]);
	selectedMapId = signal<number | null>(null);
	allSales = signal<SaleTicket[]>([]);
	ticketToEdit = signal<Ticket | null>(null);
	productToEdit = signal<Product | null>(null);

	sales = computed(() => {
		const ev = this.event();
		if (!ev) return [];
		return this.allSales().filter((sale) => sale.eventId === ev.id);
	});

	soldCount = computed(() => this.sales().length);
	revenue = computed(() => this.sales().reduce((sum, sale) => sum + (sale.ticket?.price ?? 0), 0));
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
				},
				error: () => this.router.navigate(['/manager/events']),
			});
		});
	}

	publicEventUrl(code: string): string {
		return `${window.location.origin}/e/${code}`;
	}

	saveMap(eventId: number) {
		this.eventSrv.updateEvent(eventId, { mapId: this.selectedMapId() }).subscribe((event) => this.event.set(event));
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
}
