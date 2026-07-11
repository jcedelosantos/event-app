import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CreateEventModalComponent } from './components/create-event-modal/create-event-modal.component';
import { ScheduleComponent } from '../../../shared/schedule/schedule.component';
import { Events } from '../../../models/events/events';
import { EventsService } from './services/events.service';
import { EventCardComponent } from './components/event-card/event-card.component';
import { CreateMapModalComponent } from '../maps/components/create-map-modal/create-map-modal.component';
import { Map } from '../../../models/maps/map';
import { MapsService } from '../maps/services/maps.service';
import { eventDateKey, todayKey } from '../../../utils/dates';

@Component({
	selector: 'app-events',
	imports: [CreateEventModalComponent, ScheduleComponent, EventCardComponent, CreateMapModalComponent],
	template: `
			<h2 class="pb-1">Events Manager</h2>
			<nav class="navbar border-bottom border-body">
				<div class="container-fluid">
					<form class="d-flex" role="search">
						<button type="button" class="btn btn-danger  me-4" data-bs-toggle="modal" data-bs-target="#createEventModal">Create</button>
						<input class="form-control me-2" type="search" placeholder="Search" aria-label="Name" />
						<button class="btn btn-dark me-4" type="submit">Search</button>
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
			<app-create-event-modal [maps]="maps()" (eventCreated)="onEventCreated($event)" />
			<create-map-modal (mapCreated)="onMapCreated($event)" />
			<div class="row">
				<div class="col-8">
					<div class="d-flex flex-column vh-85">
						<div class="text-white p-1" style="flex: 0 0 45%;">
							<h5>Now <span class="badge text-bg-secondary">{{ eventsNow().length }}</span></h5>

							@if (eventsNow().length) {
								<div id="carouselEvents" class="carousel slide">
									<div class="carousel-inner">
										@for (chunk of chunk2(eventsNow()); track $index; let idx = $index) {
											<div [class]="0 === idx ? 'carousel-item active' : 'carousel-item'">
												<div class="d-flex flex-row">
													@for (event of chunk; track event.id) {
														<div class="p-2">
															<event-card [event]="event" />
														</div>
													}
												</div>
											</div>
										}
									</div>
									@if (chunk2(eventsNow()).length > 1) {
										<button class="carousel-control-prev" type="button" data-bs-target="#carouselEvents" data-bs-slide="prev">
											<span class="carousel-control-prev-icon" aria-hidden="true"></span>
											<span class="visually-hidden">Previous</span>
										</button>
										<button class="carousel-control-next" type="button" data-bs-target="#carouselEvents" data-bs-slide="next">
											<span class="carousel-control-next-icon" aria-hidden="true"></span>
											<span class="visually-hidden">Next</span>
										</button>
									}
								</div>
							} @else {
								<p class="text-muted">No hay eventos en curso hoy.</p>
							}
						</div>
						<div class="text-white p-1">
							<h5>Up Coming <span class="badge text-bg-secondary">{{ eventsUpcoming().length }}</span></h5>

							@if (eventsUpcoming().length) {
								<div id="carouselEventsUpComing" class="carousel slide">
									<div class="carousel-inner">
										@for (chunk of chunk3(eventsUpcoming()); track $index; let idx = $index) {
											<div [class]="0 === idx ? 'carousel-item active' : 'carousel-item'">
												<div class="d-flex flex-row">
													@for (event of chunk; track event.id) {
														<div class="p-2">
															<event-card [event]="event" />
														</div>
													}
												</div>
											</div>
										}
									</div>
									@if (chunk3(eventsUpcoming()).length > 1) {
										<button class="carousel-control-prev" type="button" data-bs-target="#carouselEventsUpComing" data-bs-slide="prev">
											<span class="carousel-control-prev-icon" aria-hidden="true"></span>
											<span class="visually-hidden">Previous</span>
										</button>
										<button class="carousel-control-next" type="button" data-bs-target="#carouselEventsUpComing" data-bs-slide="next">
											<span class="carousel-control-next-icon" aria-hidden="true"></span>
											<span class="visually-hidden">Next</span>
										</button>
									}
								</div>
							} @else {
								<p class="text-muted">No hay próximos eventos.</p>
							}
						</div>
					</div>
				</div>
				<div class="col-4">
					<app-schedule [events]="events()" />
				</div>
			</div>

	`,
	styleUrl: './events.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent implements OnInit {
	private readonly eventSrv = inject(EventsService);
	private readonly mapsService = inject(MapsService);

	events = signal<Events[]>([]);
	maps = signal<Map[]>([]);

	eventsNow = computed(() => {
		const today = todayKey();
		return this.events().filter((e) => eventDateKey(e.dateOn) <= today && eventDateKey(e.dateOff) >= today);
	});
	eventsUpcoming = computed(() => {
		const today = todayKey();
		return this.events().filter((e) => eventDateKey(e.dateOn) > today);
	});

	ngOnInit(): void {
		this.loadEvents();
		this.loadMaps();
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

	onMapCreated(map: Map) {
		this.maps.update((list) => [map, ...list]);
	}

	chunk2(array: Events[]): Events[][] {
		return this.chunkArray(array, 2);
	}

	chunk3(array: Events[]): Events[][] {
		return this.chunkArray(array, 3);
	}

	private chunkArray<T>(array: T[], size: number): T[][] {
		const result: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			result.push(array.slice(i, i + size));
		}
		return result;
	}
}
