import { ChangeDetectionStrategy, Component, Input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Events } from '../../../../../models/events/events';
import { RouterLink } from '@angular/router';

@Component({
	selector: 'event-card',
	standalone: true,
	imports: [CommonModule, RouterLink],
	template: `
		@if (event) {
			<div class="card text-center" style="height: 220px; min-width: 240px;">
				<div class="card-header py-2 d-flex justify-content-between align-items-center">
					<span>{{ event.name }}</span>
					<div class="d-flex gap-1">
						<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="editEvent.emit(event)" title="Editar evento"><i class="bi bi-pencil"></i></button>
						<button type="button" class="btn btn-danger btn-sm rounded-circle" (click)="deleteEvent.emit(event)" title="Eliminar evento"><i class="bi bi-trash"></i></button>
					</div>
				</div>
				<div class="card-body py-2">
					<div class="d-flex justify-content-between flex-row small">
						<span class="p-1"> {{ event.dateOn.toISOString().split('T')[0] }}</span>
						@if (event.startTime) {
							<span class="p-1"> {{ event.startTime }}</span>
						}
					</div>
					<hr class="my-1" />

					<p class="card-text small mb-1">{{ event.description }}</p>
					<p class="card-text small text-body-secondary mb-1">{{ event.map?.description }}</p>
					<div class="d-flex justify-content-start flex-row flex-wrap gap-1">
						@for (ticket of event.tickets; track $index; let idx = $index) {
							<span class="badge rounded-pill text-bg-warning">{{ ticket.type }}</span>
						}
					</div>
				</div>
				<div class="card-footer text-body-secondary py-2">
					<div class="d-flex justify-content-between flex-row">
						<button class="btn btn-danger btn-sm" [routerLink]="['/manager/sales', event.id]">Sale</button>
						<button class="btn btn-danger btn-sm" [routerLink]="['/manager/events', event.id]">Details</button>
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

	editEvent = output<Events>();
	deleteEvent = output<Events>();

	eventDateRelative(date?: string | Date): string {
		if (!date) return 'Date unknown';
		const eventDate = new Date(date);
		const now = new Date();
		const diff = Math.floor((+now - +eventDate) / (1000 * 60 * 60 * 24));
		return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${diff} days ago`;
	}
}
