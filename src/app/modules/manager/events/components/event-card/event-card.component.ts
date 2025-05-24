import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Events } from '../../../../../models/events/events';

@Component({
	selector: 'event-card',
	standalone: true,
	imports: [CommonModule],
	template: `
		@if (event) {
			<div class="card text-center" style="height: 300px; min-width: 200px;">
				<div class="card-header">{{ event.name }}</div>
				<div class="card-body">
					<h5 class="card-title">{{ event.code }}</h5>
					<p class="card-text">{{ event.description }}</p>
					<a class="btn btn-danger">Sale</a>
				</div>
				<div class="card-footer text-body-secondary">
					{{ eventDateRelative(event.dateOn) }}
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
