import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { Map } from '../../../models/maps/map';
import { CardMapComponent } from './components/card-map/card-map.component';
import { NavBarMapsComponent } from './components/nav-bar-maps/nav-bar-maps.component';
import { CreateMapModalComponent } from './components/create-map-modal/create-map-modal.component';
import { MapsService } from './services/maps.service';

@Component({
	selector: 'app-maps',
	imports: [CardMapComponent, NavBarMapsComponent, CreateMapModalComponent],
	template: `
		<br />
		<br />
		<div class="row">
			<h2>Manger Maps</h2>
			<app-nav-bar-maps />
			<create-map-modal (mapCreated)="onMapCreated($event)" />

			<div class="col-12 ">
				<div class="scrollmap">
					<div class="row">
						@for (map of maps(); track map.id) {
							<div class="col-xxl-4 col-xl-6 col-lg-12 col-md-12 col-sm-12 col-12 ">
								<card-map [map]="map" />
							</div>
						}
					</div>
				</div>
			</div>
		</div>
	`,
	styleUrl: './maps.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsComponent implements OnInit {
	private readonly mapsService = inject(MapsService);

	maps = signal<Map[]>([]);

	ngOnInit(): void {
		this.loadMaps();
	}

	loadMaps() {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
	}

	onMapCreated(map: Map) {
		this.maps.update((list) => [map, ...list]);
	}
}
