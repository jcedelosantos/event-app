import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { CreateEventModalComponent } from './components/create-event-modal/create-event-modal.component';
import { ScheduleComponent } from '../../../shared/schedule/schedule.component';
import { Events } from '../../../models/events/events';
import { EventsService } from './services/events.service';
import { EventCardComponent } from './components/event-card/event-card.component';
import { CreateMapModalComponent } from '../maps/components/create-map-modal/create-map-modal.component';
import { EventQrModalComponent } from './components/event-qr-modal/event-qr-modal.component';
import { Map } from '../../../models/maps/map';
import { MapsService } from '../maps/services/maps.service';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';

declare const bootstrap: any;

@Component({
	selector: 'app-events',
	imports: [CreateEventModalComponent, ScheduleComponent, EventCardComponent, CreateMapModalComponent, EventQrModalComponent],
	template: `
			<h2 class="section-title">Events Manager</h2>
			<nav class="navbar border-bottom border-body">
				<div class="container-fluid">
					<form class="d-flex" role="search" (submit)="$event.preventDefault(); searchText.set(searchInput.value)">
						<button type="button" class="btn btn-danger  me-4" data-bs-toggle="modal" data-bs-target="#createEventModal">Create</button>
						<input #searchInput class="form-control me-2" type="search" placeholder="Search" aria-label="Name" (input)="searchText.set(searchInput.value)" />
						<button class="btn btn-dark me-4" type="submit">Search</button>
						@if (orgUrl(); as url) {
							<a class="btn btn-outline-light me-4" [href]="url" target="_blank" rel="noopener" title="Abrir la portada pública de tu organización">
								<i class="bi bi-box-arrow-up-right"></i> Portada pública
							</a>
						}
					</form>
					<div class="navbar-brand">
						<div class="row">
							<div class="col">
								<i class="bi bi-arrow-up-circle-fill" data-bs-toggle="modal" data-bs-target="#importEventsModal"></i>
							</div>
							<div class="col">
								<i class="bi bi-arrow-down-circle-fill" data-bs-toggle="modal" data-bs-target="#exportEventsModal"></i>
							</div>
						</div>
					</div>
				</div>
			</nav>
			<br />
			<app-create-event-modal
				#createEventModalRef
				[maps]="maps()"
				[events]="events()"
				[(event)]="eventToEdit"
				(eventCreated)="onEventCreated($event)"
				(eventUpdated)="onEventUpdated()"
			/>
			<create-map-modal (mapCreated)="onMapCreated($event)" />
			<app-event-qr-modal [event]="eventForQr()" />
			<div class="row">
				<div class="col-12 col-lg-8">
					<div class="d-flex flex-column vh-85">
						<div class="text-white p-1" style="flex: 0 0 45%;">
							<h5>Now <span class="badge text-bg-secondary">{{ eventsNow().length }}</span></h5>

							@if (eventsNow().length) {
								<div class="d-flex flex-row flex-wrap event-card-list">
									@for (event of eventsNow(); track event.id) {
										<div class="p-2">
											<event-card
												[event]="event"
												(showQr)="onShowQr($event)"
												(editEvent)="onEditEvent($event)"
												(duplicateEvent)="onDuplicateEvent($event)"
												(deleteEvent)="onDeleteEvent($event)"
											/>
										</div>
									}
								</div>
							} @else {
								<p class="text-muted">No hay eventos en curso hoy.</p>
							}
						</div>
						<div class="text-white p-1">
							<h5>Up Coming <span class="badge text-bg-secondary">{{ eventsUpcoming().length }}</span></h5>

							@if (eventsUpcoming().length) {
								<div class="d-flex flex-row flex-wrap event-card-list">
									@for (event of eventsUpcoming(); track event.id) {
										<div class="p-2">
											<event-card
												[event]="event"
												(showQr)="onShowQr($event)"
												(editEvent)="onEditEvent($event)"
												(duplicateEvent)="onDuplicateEvent($event)"
												(deleteEvent)="onDeleteEvent($event)"
											/>
										</div>
									}
								</div>
							} @else {
								<p class="text-muted">No hay próximos eventos.</p>
							}
						</div>
					</div>
				</div>
				<div class="col-12 col-lg-4">
					<app-schedule [events]="events()" />
				</div>
			</div>

	`,
	styleUrl: './events.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent implements OnInit, AfterViewInit {
	private readonly eventSrv = inject(EventsService);
	private readonly mapsService = inject(MapsService);
	private readonly authService = inject(AuthService);

	events = signal<Events[]>([]);
	maps = signal<Map[]>([]);
	eventToEdit = signal<Events | null>(null);
	eventForQr = signal<Events | null>(null);
	searchText = signal('');
	private readonly createEventModalRef = viewChild<CreateEventModalComponent>('createEventModalRef');

	// Mismo link que "Portada pública" en Settings — un acceso directo acá evita tener que ir hasta
	// Settings solo para abrir/compartir la página pública con todos los eventos de la organización.
	orgUrl = computed(() => {
		const slug = this.authService.currentUser()?.tenant?.slug;
		return slug ? `${window.location.origin}/o/${slug}` : null;
	});

	filteredEvents = computed(() => {
		const term = this.searchText().trim().toLowerCase();
		if (!term) return this.events();
		return this.events().filter((e) => [e.name, e.code, e.description].some((field) => field?.toLowerCase().includes(term)));
	});

	eventsNow = computed(() => {
		const today = todayKey();
		return this.filteredEvents().filter((e) => eventDateKey(e.dateOn) <= today && eventDateKey(e.dateOff) >= today);
	});
	eventsUpcoming = computed(() => {
		const today = todayKey();
		return this.filteredEvents().filter((e) => eventDateKey(e.dateOn) > today);
	});

	ngOnInit(): void {
		this.loadEvents();
		this.loadMaps();
	}

	ngAfterViewInit(): void {
		const eventModalEl = document.getElementById('createEventModal');
		eventModalEl?.addEventListener('hidden.bs.modal', () => this.eventToEdit.set(null));

		// "+ Map" (en create-event-modal) cierra este modal para abrir #createMapModal en su lugar,
		// en vez de apilarlo encima (ver el comentario en openMapModal() del componente hijo) — al
		// cerrarse el mapa, se reabre el form de evento para que el usuario continúe donde estaba.
		const mapModalEl = document.getElementById('createMapModal');
		mapModalEl?.addEventListener('hidden.bs.modal', () => {
			if (eventModalEl) {
				bootstrap.Modal.getOrCreateInstance(eventModalEl).show();
			}
		});
	}

	loadEvents() {
		this.eventSrv.getEvents().subscribe((events) => this.events.set(events));
	}

	loadMaps() {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
	}

	onEventCreated(event: Events) {
		this.events.update((list) => [event, ...list]);
	}

	// Recarga la lista completa en vez de parchear solo el evento editado — vincular/desvincular
	// "otra fecha" (ver create-event-modal) también cambia duplicateGroupKey en OTRO evento que esta
	// respuesta no incluye, y ese evento quedaría con datos viejos hasta el próximo refresh manual.
	onEventUpdated() {
		this.loadEvents();
	}

	onShowQr(event: Events) {
		this.eventForQr.set(event);
		const modalEl = document.getElementById('eventQrModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onEditEvent(event: Events) {
		this.eventToEdit.set(event);
		const modalEl = document.getElementById('createEventModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	// "Duplicar" precarga el form de creación con los datos del evento origen (ver
	// prefillForDuplicate) en vez de armar un evento nuevo desde cero — a propósito no toca
	// eventToEdit: si lo hiciera, el modal quedaría en modo "editar" y el submit haría un PUT sobre
	// el evento original en lugar de crear uno nuevo.
	onDuplicateEvent(event: Events) {
		this.createEventModalRef()?.prefillForDuplicate(event);
		const modalEl = document.getElementById('createEventModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onDeleteEvent(event: Events) {
		confirm(`¿Eliminar el evento "${event.name}"? Esta acción no se puede deshacer.`, {
			onConfirm: () => {
				this.eventSrv.deleteEvent(event.id).subscribe({
					next: () => this.events.update((list) => list.filter((e) => e.id !== event.id)),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}

	onMapCreated(map: Map) {
		this.maps.update((list) => [map, ...list]);
	}
}
