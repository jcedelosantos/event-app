import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CreateEventModalComponent } from './components/create-event-modal/create-event-modal.component';
import { ScheduleComponent } from '../../../shared/schedule/schedule.component';
import { Events } from '../../../models/events/events';
import { EventsService } from './services/events.service';
import { EventCardComponent } from './components/event-card/event-card.component';

@Component({
	selector: 'app-events',
	imports: [CreateEventModalComponent, ScheduleComponent, EventCardComponent],
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
			<app-create-event-modal (eventCreated)="onEventCreated($event)" />
			<div class="row">
				<div class="col-8">
					<div class="d-flex flex-column vh-85">
						<div class="text-white p-1" style="flex: 0 0 20%;">
							<h5>Now</h5>

							<div id="carouselEvents" class="carousel slide">
								<div class="carousel-inner">
									@for (eventNow of eventsNow(); track $index; let idx = $index) {
										<div [class]="0 === idx ? 'carousel-item active' : 'carousel-item'">
											<div class="d-flex flex-row">
												@for (event of eventNow; track $index) {
													<div class="p-2">
														<event-card [event]="event" />
													</div>
												}
											</div>
										</div>
									}
								</div>
								<button class="carousel-control-prev" type="button" data-bs-target="#carouselEvents" data-bs-slide="prev">
									<span class="carousel-control-prev-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Previous</span>
								</button>
								<button class="carousel-control-next" type="button" data-bs-target="#carouselEvents" data-bs-slide="next">
									<span class="carousel-control-next-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Next</span>
								</button>
							</div>
						</div>
						<div class="text-white p-1">
							<h5>Up Coming</h5>

							<div id="carouselEventsUpComing" class="carousel slide">
								<div class="carousel-inner">
									@for (eventUpcoming of eventsUpcoming(); track $index; let idx = $index) {
										<div [class]="0 === idx ? 'carousel-item active' : 'carousel-item'">
											<div class="d-flex flex-row">
												@for (event of eventUpcoming; track $index) {
													<div class="p-2">
														<event-card [event]="event" />
													</div>
												}
											</div>
										</div>
									}
								</div>
								<button class="carousel-control-prev" type="button" data-bs-target="#carouselEventsUpComing" data-bs-slide="prev">
									<span class="carousel-control-prev-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Previous</span>
								</button>
								<button class="carousel-control-next" type="button" data-bs-target="#carouselEventsUpComing" data-bs-slide="next">
									<span class="carousel-control-next-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Next</span>
								</button>
							</div>

							<div id="carouselEventsUpComingLast" class="carousel slide">
								<div class="carousel-inner">
									@for (eventUpcoming of eventsUpcoming(); track $index; let idx = $index) {
										<div [class]="0 === idx ? 'carousel-item active' : 'carousel-item'">
											<div class="d-flex flex-row">
												@for (event of eventUpcoming; track $index) {
													<div class="p-2">
														<event-card [event]="event" />
													</div>
												}
											</div>
										</div>
									}
								</div>
								<button class="carousel-control-prev" type="button" data-bs-target="#carouselEventsUpComingLast" data-bs-slide="prev">
									<span class="carousel-control-prev-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Previous</span>
								</button>
								<button class="carousel-control-next" type="button" data-bs-target="#carouselEventsUpComingLast" data-bs-slide="next">
									<span class="carousel-control-next-icon" aria-hidden="true"></span>
									<span class="visually-hidden">Next</span>
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="col-4">
					<app-schedule />
				</div>
			</div>
		
	`,
	styleUrl: './events.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent implements OnInit {
	private readonly eventSrv = inject(EventsService);

	events = signal<Events[]>([]);
	eventsNow = computed(() => this.chunkArray(this.events(), 2));
	eventsUpcoming = computed(() => this.chunkArray(this.events(), 3));

	ngOnInit(): void {
		this.loadEvents();
	}

	loadEvents() {
		this.eventSrv.getEvents().subscribe((events) => this.events.set(events));
	}

	onEventCreated(event: Events) {
		this.events.update((list) => [event, ...list]);
	}

	private chunkArray<T>(array: T[], size: number): T[][] {
		const result: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			result.push(array.slice(i, i + size));
		}
		return result;
	}
}
