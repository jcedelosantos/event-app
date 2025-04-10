import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';

import { Map } from '../../../../../models/maps/map';
import { RouterLink } from '@angular/router';
import { GoogleMapsModule } from '@angular/google-maps';
// import { Area } from "../../../../models/maps/area";
// import { Seat } from "../../../../models/maps/seat";
// import { Table } from "../../../../models/maps/table";

@Component({
	selector: 'card-map',
	imports: [RouterLink, GoogleMapsModule],
	template: `
		@if (map) {
			<div class="card p-1">
				<div class="d-flex justify-content-between">
					<div class="m-2">
						<h4>{{ map.name }}</h4>
					</div>
					<div>
						<button type="button" class="btn btn-dark btn-sm rounded-circle"><i class="bi bi-pencil"></i></button>
						<button type="button" class="btn btn-dark btn-sm rounded-circle"><i class="bi bi-x-lg"></i></button>
					</div>
				</div>

				<div class="map-container">
					<google-map height="300px" width="100%" [center]="center" [zoom]="zoom">
						<map-marker [position]="center" [label]="'Ubicación X'"></map-marker>
					</google-map>
				</div>
				<div class="card-body">
					<h5 class="card-title">{{ map.description }}</h5>
					<div class="d-flex justify-content-evenly">
						<div class="bd-highlight">
							Areas : <span class="badge text-bg-danger">{{ map.areas.length }}</span>
						</div>
						<div class="bd-highlight">
							Tables : <span class="badge text-bg-danger"> {{ map.totalTables }}</span> / <span class="badge text-bg-danger">{{ map.totalTablesSeat }}</span>
						</div>
						<div class="bd-highlight">
							Seat : <span class="badge text-bg-danger">{{ map.totalSeats }}</span>
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
export class CardMapComponent implements OnInit {
	center: google.maps.LatLngLiteral = { lat: 18.4628068, lng: -70.0412847 };
	zoom = 18;

	@Input()
	map: Map | undefined;

	constructor() {}

	ngOnInit(): void {
		if (this.map) {
			this.center = { lat: this.map.x, lng: this.map.y };
		}
	}
}
