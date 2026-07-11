import { ChangeDetectionStrategy, Component, Input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { Map } from '../../../../../models/maps/map';
import { RouterLink } from '@angular/router';

@Component({
	selector: 'card-map',
	imports: [RouterLink, DecimalPipe],
	template: `
		@if (map) {
			<div class="card p-1">
				<div class="d-flex justify-content-between">
					<div class="m-2">
						<h4>{{ map.name }}</h4>
					</div>
					<div>
						<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="editMap.emit(map)"><i class="bi bi-pencil"></i></button>
						<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteMap.emit(map)"><i class="bi bi-x-lg"></i></button>
					</div>
				</div>

				<div class="map-placeholder">
					<i class="bi bi-geo-alt-fill"></i>
					<span class="map-placeholder-coords">{{ map.x | number: '1.4-4' }}, {{ map.y | number: '1.4-4' }}</span>
				</div>
				<div class="card-body">
					<h5 class="card-title">{{ map.description }}</h5>
					<div class="d-flex justify-content-evenly">
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
				<button type="button" class="btn btn-outline-danger btn-md btn-block p" routerLink="/manager/maps/{{ map.id }}/areas">View Details</button>
				<br />
			</div>
			<br />
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
