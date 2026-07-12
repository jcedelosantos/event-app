import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { Map } from '../../../models/maps/map';
import { CardMapComponent } from './components/card-map/card-map.component';
import { NavBarMapsComponent } from './components/nav-bar-maps/nav-bar-maps.component';
import { CreateMapModalComponent } from './components/create-map-modal/create-map-modal.component';
import { MapsService } from './services/maps.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

declare const bootstrap: any;

@Component({
	selector: 'app-maps',
	imports: [CardMapComponent, NavBarMapsComponent, CreateMapModalComponent],
	template: `
		<div class="row">
			<h2 class="section-title">Manger Maps</h2>
			<app-nav-bar-maps />
			<create-map-modal [(map)]="mapToEdit" (mapCreated)="onMapCreated($event)" (mapUpdated)="onMapUpdated($event)" />

			<div class="col-12 ">
				<div class="scrollmap">
					<div class="row">
						@for (map of maps(); track map.id) {
							<div class="col-xxl-4 col-xl-6 col-lg-12 col-md-12 col-sm-12 col-12 ">
								<card-map [map]="map" (editMap)="onEditMap($event)" (deleteMap)="onDeleteMap($event)" />
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
export class MapsComponent implements OnInit, AfterViewInit {
	private readonly mapsService = inject(MapsService);

	maps = signal<Map[]>([]);
	mapToEdit = signal<Map | null>(null);

	ngOnInit(): void {
		this.loadMaps();
	}

	ngAfterViewInit(): void {
		const modalEl = document.getElementById('createMapModal');
		modalEl?.addEventListener('hidden.bs.modal', () => this.mapToEdit.set(null));
	}

	loadMaps() {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
	}

	onMapCreated(map: Map) {
		this.maps.update((list) => [map, ...list]);
	}

	onMapUpdated(map: Map) {
		this.maps.update((list) => list.map((m) => (m.id === map.id ? map : m)));
	}

	onEditMap(map: Map | undefined) {
		if (!map) return;
		this.mapToEdit.set(map);
		const modalEl = document.getElementById('createMapModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onDeleteMap(map: Map | undefined) {
		if (!map) return;
		confirm(`¿Eliminar el mapa "${map.name}"?`, {
			onConfirm: () => {
				this.mapsService.deleteMap(map.id).subscribe({
					next: () => {
						this.maps.update((list) => list.filter((m) => m.id !== map.id));
					},
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}
}
