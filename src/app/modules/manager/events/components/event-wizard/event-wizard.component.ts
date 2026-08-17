import { AfterViewInit, ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CreateEventModalComponent } from '../create-event-modal/create-event-modal.component';
import { CreateMapModalComponent } from '../../../maps/components/create-map-modal/create-map-modal.component';
import { UpdateTicketModalComponent } from '../../../tickets/components/update-ticket-modal/update-ticket-modal.component';
import { UpdateProductModalComponent } from '../../../products/components/update-product-modal/update-product-modal.component';
import { EventsService } from '../../services/events.service';
import { MapsService } from '../../../maps/services/maps.service';
import { TicketsService } from '../../../tickets/services/tickets.service';
import { ProductsService } from '../../../products/services/products.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { PLAN_FEATURES } from '../../../../../shared/pricing-plans';
import { isEventPlanCode } from '../../../../../shared/event-plans';
import { Events } from '../../../../../models/events/events';
import { Map } from '../../../../../models/maps/map';
import { Ticket } from '../../../../../models/tickets/ticket';
import { Product } from '../../../../../models/products/product';

declare const bootstrap: any;

type WizardStep = 'evento' | 'mapa' | 'tickets' | 'productos' | 'listo';

@Component({
	selector: 'app-event-wizard',
	imports: [RouterLink, CreateEventModalComponent, CreateMapModalComponent, UpdateTicketModalComponent, UpdateProductModalComponent],
	template: `
		<h2 class="section-title">Crear evento — modo guiado</h2>

		<div class="d-flex gap-2 mb-4 flex-wrap">
			@for (s of stepOrder; track s.key) {
				<span
					class="badge"
					[class.text-bg-success]="isStepDone(s.key)"
					[class.text-bg-danger]="step() === s.key"
					[class.text-bg-secondary]="!isStepDone(s.key) && step() !== s.key"
				>
					@if (isStepDone(s.key)) {
						<i class="bi bi-check-lg"></i>
					}
					{{ s.label }}
				</span>
			}
		</div>

		@switch (step()) {
			@case ('evento') {
				<p class="text-body-secondary">Completá los datos del evento — al guardarlo, seguimos con el mapa y los tickets.</p>
			}
			@case ('mapa') {
				<div class="card" style="max-width: 480px;">
					<div class="card-body">
						<h5 class="card-title">Este evento todavía no tiene mapa asignado</h5>
						<p class="card-text text-body-secondary small">
							Necesitás un mapa para vender tickets con asiento. Podés crear uno ahora, o hacerlo más tarde desde Maps.
						</p>
						<div class="d-flex gap-2">
							<button type="button" class="btn btn-danger btn-sm" (click)="startMapCreation()">Crear mapa</button>
							<button type="button" class="btn btn-outline-secondary btn-sm" (click)="skipMap()">Omitir por ahora</button>
						</div>
					</div>
				</div>
			}
			@case ('tickets') {
				<div class="card" style="max-width: 480px;">
					<div class="card-body">
						<h5 class="card-title">Tipos de ticket</h5>
						@if (createdTickets().length) {
							<p class="card-text small">
								Ya creaste: <strong>{{ createdTicketNames() }}</strong>
							</p>
						} @else {
							<p class="card-text text-body-secondary small">Todavía no creaste ningún ticket para este evento.</p>
						}
						<div class="d-flex gap-2 flex-wrap">
							<button type="button" class="btn btn-danger btn-sm" (click)="openTicketModal()">
								<i class="bi bi-plus-lg"></i> {{ createdTickets().length ? 'Agregar otro' : 'Crear ticket' }}
							</button>
							@if (createdTickets().length) {
								<button type="button" class="btn btn-outline-light btn-sm" (click)="goToProductsOrFinish()">Continuar</button>
							}
							<button type="button" class="btn btn-outline-secondary btn-sm" (click)="goToProductsOrFinish()">Omitir por ahora</button>
						</div>
					</div>
				</div>
			}
			@case ('productos') {
				<div class="card" style="max-width: 480px;">
					<div class="card-body">
						<h5 class="card-title">Productos <span class="text-muted small">(opcional)</span></h5>
						@if (createdProducts().length) {
							<p class="card-text small">Ya creaste {{ createdProducts().length }} producto(s).</p>
						} @else {
							<p class="card-text text-body-secondary small">¿Vendés merchandising, bebidas u otra cosa en este evento?</p>
						}
						<div class="d-flex gap-2 flex-wrap">
							<button type="button" class="btn btn-danger btn-sm" (click)="openProductModal()">
								<i class="bi bi-plus-lg"></i> {{ createdProducts().length ? 'Agregar otro' : 'Crear producto' }}
							</button>
							<button type="button" class="btn btn-outline-light btn-sm" (click)="finish()">
								{{ createdProducts().length ? 'Continuar' : 'Omitir y terminar' }}
							</button>
						</div>
					</div>
				</div>
			}
			@case ('listo') {
				<div class="card" style="max-width: 480px;">
					<div class="card-body">
						<h5 class="card-title text-success"><i class="bi bi-check-circle"></i> ¡Evento listo!</h5>
						<p class="card-text small text-body-secondary">
							{{ createdEvent()?.name }} — {{ createdTickets().length }} tipo(s) de ticket, {{ createdProducts().length }} producto(s).
						</p>
						<div class="d-flex flex-column gap-2 align-items-start">
							@if (createdEvent(); as event) {
								<a [routerLink]="['/manager/events', event.id]" class="btn btn-danger btn-sm">Ver detalle del evento</a>
								@if (event.map && !hasAreas()) {
									<a [routerLink]="['/manager/maps', event.map.id, 'areas']" class="btn btn-outline-light btn-sm">
										Armar áreas y asientos del mapa
									</a>
								}
							}
							<a routerLink="/manager/events" class="btn btn-outline-secondary btn-sm">Volver a Eventos</a>
						</div>
					</div>
				</div>
			}
		}

		<app-create-event-modal [maps]="maps()" [events]="noEvents" (eventCreated)="onEventCreated($event)" />
		<create-map-modal (mapCreated)="onMapCreated($event)" />
		<app-update-ticket-modal [defaultEventId]="createdEvent()?.id ?? null" (ticketSaved)="onTicketSaved()" />
		<app-update-product-modal [defaultEventId]="createdEvent()?.id ?? null" (productSaved)="onProductSaved()" />
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventWizardComponent implements OnInit, AfterViewInit {
	private readonly eventsService = inject(EventsService);
	private readonly mapsService = inject(MapsService);
	private readonly ticketsService = inject(TicketsService);
	private readonly productsService = inject(ProductsService);
	private readonly authService = inject(AuthService);

	stepOrder: Array<{ key: WizardStep; label: string }> = [
		{ key: 'evento', label: 'Evento' },
		{ key: 'mapa', label: 'Mapa' },
		{ key: 'tickets', label: 'Tickets' },
		{ key: 'productos', label: 'Productos' },
	];

	// create-event-modal solo usa [events] para chequear duplicados de "otra fecha" en tenants CLUB
	// al editar — irrelevante acá (siempre es un evento nuevo) — arreglo vacío estable para que
	// OnPush del hijo no vea un input "cambiado" en cada ciclo de detección de cambios.
	readonly noEvents: Events[] = [];

	step = signal<WizardStep>('evento');
	createdEvent = signal<Events | null>(null);
	maps = signal<Map[]>([]);
	createdTickets = signal<Ticket[]>([]);
	createdProducts = signal<Product[]>([]);

	// Sin plan asignado o tenant de evento único (ver shared/event-plans.ts), no se restringe —
	// mismo criterio ya usado en nav-bar-menu.component.ts para no romper con un plan sin entrada
	// en PLAN_FEATURES.
	hasProductsModule = computed(() => {
		const plan = this.authService.currentUser()?.tenant?.plan;
		if (!plan || isEventPlanCode(plan)) return true;
		return PLAN_FEATURES[plan]?.productsModule ?? false;
	});

	hasAreas = computed(() => (this.createdEvent()?.map?.areas?.length ?? 0) > 0);
	createdTicketNames = computed(() => this.createdTickets().map((t) => t.name).join(', '));

	// Distingue el "+ Map" inline del paso Evento (el form todavía no se guardó, el mapa nuevo solo
	// tiene que aparecer en su <select>) del paso Mapa aparte, después de guardar un evento sin
	// mapa (acá SÍ hay que vincularlo con un PUT porque el evento ya existe) — mismo mecanismo de
	// modal compartido (`create-map-modal`) que ya usa create-event-modal/events.component.ts.
	private awaitingMapLink = false;

	ngOnInit(): void {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
	}

	ngAfterViewInit(): void {
		this.showModal('createEventModal');

		const mapModalEl = document.getElementById('createMapModal');
		mapModalEl?.addEventListener('hidden.bs.modal', () => {
			if (!this.awaitingMapLink && this.step() === 'evento') {
				this.showModal('createEventModal');
			}
		});
	}

	private showModal(id: string) {
		const el = document.getElementById(id);
		if (el) bootstrap.Modal.getOrCreateInstance(el).show();
	}

	isStepDone(key: WizardStep): boolean {
		const order: WizardStep[] = ['evento', 'mapa', 'tickets', 'productos', 'listo'];
		return order.indexOf(key) < order.indexOf(this.step());
	}

	onEventCreated(event: Events) {
		this.createdEvent.set(event);
		this.step.set(event.map ? 'tickets' : 'mapa');
	}

	startMapCreation() {
		this.awaitingMapLink = true;
		this.showModal('createMapModal');
	}

	onMapCreated(map: Map) {
		this.maps.update((list) => [map, ...list]);
		if (!this.awaitingMapLink) return; // "+ Map" inline del paso Evento — nada más que hacer acá

		this.awaitingMapLink = false;
		const event = this.createdEvent();
		if (!event) return;
		this.eventsService.updateEvent(event.id, { mapId: map.id }).subscribe((updated) => {
			this.createdEvent.set(updated);
			this.step.set('tickets');
		});
	}

	skipMap() {
		this.step.set('tickets');
	}

	openTicketModal() {
		this.showModal('updateTicketModal');
	}

	onTicketSaved() {
		const event = this.createdEvent();
		if (!event) return;
		this.ticketsService.getTicketsByEvent(event.id).subscribe((tickets) => this.createdTickets.set(tickets));
	}

	goToProductsOrFinish() {
		this.step.set(this.hasProductsModule() ? 'productos' : 'listo');
	}

	openProductModal() {
		this.showModal('updateProductModal');
	}

	onProductSaved() {
		const event = this.createdEvent();
		if (!event) return;
		this.productsService.getProductsByEvent(event.id).subscribe((products) => this.createdProducts.set(products));
	}

	finish() {
		this.step.set('listo');
	}
}
