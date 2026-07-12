import { ChangeDetectionStrategy, Component, Input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { Map } from '../../../../../models/maps/map';
import { RouterLink } from '@angular/router';

@Component({
	selector: 'card-map',
	imports: [RouterLink, DecimalPipe],
	template: `
		@if (map) {
			<div class="card p-1 mb-3">
				<div class="d-flex justify-content-between align-items-center px-2 pt-1">
					<h6 class="mb-0">{{ map.name }}</h6>
					<div>
						<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="editMap.emit(map)"><i class="bi bi-pencil"></i></button>
						<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteMap.emit(map)"><i class="bi bi-x-lg"></i></button>
					</div>
				</div>

				<div class="map-placeholder">
					<i class="bi bi-geo-alt-fill"></i>
					<span class="map-placeholder-coords">{{ map.x | number: '1.4-4' }}, {{ map.y | number: '1.4-4' }}</span>
				</div>
				<div class="card-body py-2">
					<p class="card-text small text-body-secondary mb-2">{{ map.description }}</p>
					<div class="d-flex justify-content-evenly small">
						<div class="bd-highlight">
							Areas : <span class="badge text-bg-danger">{{ map.areas.length }}</span>
						</div>
						<div class="bd-highlight">
							Mesas : <span class="badge text-bg-danger">{{ tableCount(map) }}</span>
						</div>
						<div class="bd-highlight">
							Asientos : <span class="badge text-bg-danger">{{ seatCount(map) }}</span>
						</div>
					</div>
				</div>
				<button type="button" class="btn btn-outline-danger btn-sm btn-block" routerLink="/manager/maps/{{ map.id }}/areas">View Details</button>
			</div>
		}
	`,
	styleUrl: './card-map.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardMapComponent {
	@Input()
	map: Map | undefined;

	editMap = output<Map | undefined>();
	deleteMap = output<Map | undefined>();

	tableCount(map: Map): number {
		return map.areas.reduce((sum, area) => sum + (area.tables?.length ?? 0), 0);
	}

	seatCount(map: Map): number {
		return map.areas.reduce((sum, area) => sum + (area.seats?.length ?? 0), 0);
	}
}
