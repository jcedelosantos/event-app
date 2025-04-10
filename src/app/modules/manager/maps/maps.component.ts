import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

import { maps } from '../../../data/map';
import { Map } from '../../../models/maps/map';
import { CardMapComponent } from './components/card-map/card-map.component';
import { NavBarMapsComponent } from './components/nav-bar-maps/nav-bar-maps.component';

@Component({
	selector: 'app-maps',
	imports: [CardMapComponent, NavBarMapsComponent],
	template: `
		<br />
		<br />
		<div class="row">
			<h2>Manger Maps</h2>
			<app-nav-bar-maps />

			<div class="col-12 ">
				<div class="scrollmap">
					<div class="row">
						@for (map of maps; track map.id) {
							<div class="col-xxl-4 col-xl-6 col-lg-12 col-md-12 col-sm-12 col-12 ">
								<card-map [map]="map" />
							</div>
						}
					</div>
				</div>
			</div>
			<!-- <div class="col-12">
      footer
    </div> -->
		</div>
	`,
	styleUrl: './maps.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapsComponent implements OnInit {
	maps: Array<Map> | undefined;

	constructor() {}
	ngOnInit(): void {
		this.maps = maps;
	}
}
