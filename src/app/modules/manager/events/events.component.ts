import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CreateEventModalComponent } from './component/create-event-modal/create-event-modal.component';

@Component({
	selector: 'app-events',
	imports: [CreateEventModalComponent],
	template: `
		<br />
		<br />
		<h2>Events Manager</h2>
		<br />

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
		<app-create-event-modal />
	`,
	styleUrl: './events.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent {}
