import { ChangeDetectionStrategy, Component, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Events } from '../../../../../models/events/events';
import { RouterLink } from '@angular/router';

@Component({
	selector: 'event-card',
	standalone: true,
	imports: [CommonModule, RouterLink],
	template: `
		@if (event) {
			<div class="card text-center" style="height: 340px; min-width: 300px;">
				<div class="card-header">{{ event.name }}</div>
				<div class="card-body">
					<!-- <h5 class="card-title">{{ event.code }}</h5> -->
					<div class="d-flex justify-content-between flex-row ">
						<span class="p-1"> Date: {{ event.dateOn.toISOString().split('T')[0] }}</span>
						<span class="p-1"> Start Time: {{ event.dateSale.toISOString().split('T')[1].split('.')[0] }}</span>
					</div>
					<hr />

					<p class="card-text">{{ event.description }}</p>
					<p class="card-text">{{ event.map?.description }}</p>
					<div class="d-flex justify-content-start flex-row ">
						<div class="p-1">
							<span> Ticket </span>
						</div>

						@for (ticket of event.tickets; track $index; let idx = $index) {
							<div class="p-1">
								<span class="badge rounded-pill text-bg-warning">{{ ticket.type }}</span>
							</div>
						}
					</div>
				</div>
				<div class="card-footer text-body-secondary">
					<!-- {{ eventDateRelative(event.dateOn) }} -->

					<div class="d-flex justify-content-between flex-row ">
						<!-- <div class="p-2">Flex item 1</div> -->
						<div class="p-1"><button class="btn btn-danger" routerLink="/manager/sales/1" >Sale</button></div>
						<div class="p-1"><button class="btn btn-danger" routerLink="/manager/events/1">Details</button></div>
					</div>
				</div>
			</div>
		} @else {
			<div class="text-muted">No event data</div>
		}
	`,
	styleUrl: './event-card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCardComponent {
	@Input({ required: true })
	event!: Events;

	eventDateRelative(date?: string | Date): string {
		if (!date) return 'Date unknown';
		const eventDate = new Date(date);
		const now = new Date();
		const diff = Math.floor((+now - +eventDate) / (1000 * 60 * 60 * 24));
		return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
	}
}
