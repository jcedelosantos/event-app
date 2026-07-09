import { ChangeDetectionStrategy, Component, ViewChild, OnInit, ElementRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { NavBarMapComponent } from '../components/nav-bar-map/nav-bar-map.component';
import { CollapseSeatsComponent } from '../components/collapse-seats/collapse-seats.component';
import { CollapseTablesComponent } from '../components/accordion-tables/collapse-tables.component';
import { MapsService } from '../services/maps.service';
import { AreasService } from '../services/areas.service';
import { info } from '../../../../utils/messages';

@Component({
	selector: 'app-seats',
	imports: [NavBarMapComponent, CollapseSeatsComponent, CollapseTablesComponent],
	template: `
		<nav-bar-map [areas]="map()?.areas" [idMap]="map()?.id" />
		<div class="col-xxl-9 col-md-12 ">
			<h3>Manager Seat</h3>
		</div>
		<div class="scroll-map">
			<div class="row">
				<div class="col-xxl-9 col-md-12 bg-black">
					@if (area()?.img) {
						<div class="scrollimg">
							<div class="container">
								<div class="image-container " class="image-container " #imageContainer (mousemove)="moveButton($event)">
									<img #image [src]="area()?.img" class="background-image" (dblclick)="openCreateSeatForm($event)" />
									@for (seat of area()?.seats; track seat.id; let idx = $index) {
										<div class="draggable-btn" (mousedown)="startDragging(idx, $event)" (mouseup)="stopDragging()" (mouseleave)="stopDragging()" [style.top.px]="seat.y" [style.left.px]="seat.x">
											@if (seat.icon) {
												<div class="row">
													<div class="col-12">
														<span [style.color]="seat.color" [style.font-size.px]="seat.size * 0.5">
															{{ seat.name }}
														</span>
													</div>
													<div class="col-12">
														<i [class]="'bi ' + seat.icon + ' shadow-sm p-1 mb-2  rounded'" [style.color]="seat.color" [style.font-size.px]="seat.size"></i>
													</div>
												</div>
											}
										</div>
									}
								</div>
							</div>
						</div>
					}
				</div>
				<br />
				@if (area(); as a) {
					<div class="col-xxl-3 col-gl-12 col-md-12">
						<div class="scroll-list">
							<div class="card">
								<div class="card-header">
									<div class="d-flex flex-row  justify-content-between">
										<div class="p-2">
											@if (a.icon) {
												<i class="bi {{ a.icon }}"></i>
											}
											{{ a.name }}
										</div>
									</div>
								</div>
								<ul class="list-group list-group-flush">
									<collapse-seats [seats]="a.seats" [id]="a.id" />
									<collapse-tables [tables]="a.tables" [id]="a.id" />
									<li class="list-group-item"></li>
								</ul>
							</div>
							<br />
						</div>
					</div>
				}
			</div>
		</div>
	`,
	styleUrl: './seats.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatsComponent implements OnInit {
	private readonly mapsService = inject(MapsService);
	private readonly areasService = inject(AreasService);

	map = signal<Map | undefined>(undefined);
	area = signal<Area | undefined>(undefined);

	isDragging = false;
	activeButtonIndex: number | null = null;
	offsetX = 0;
	offsetY = 0;
	imgWidth = 0;
	imgHeight = 0;

	@ViewChild('imageContainer') imageContainer!: ElementRef;
	@ViewChild('image') image!: ElementRef;

	constructor(
		private route: ActivatedRoute,
		private router: Router,
	) {}

	ngOnInit() {
		this.route.paramMap.subscribe((params) => {
			const idMap = params.get('id_map');
			const idArea = params.get('id_area');

			if (!idMap || !idArea || Number.isNaN(Number(idMap)) || Number.isNaN(Number(idArea))) {
				this.router.navigate(['/manager/maps']);
				return;
			}

			this.mapsService.getMap(Number(idMap)).subscribe({
				next: (map) => this.map.set(map),
				error: () => this.router.navigate(['/manager/maps']),
			});
			this.areasService.getArea(Number(idArea)).subscribe({
				next: (area) => this.area.set(area),
				error: () => this.router.navigate(['/manager/maps/' + idMap + '/areas']),
			});
		});
	}

	// La creación/edición de asientos aún no está implementada (pendiente de diseño, fuera del alcance de esta fase).
	openCreateSeatForm(_event: MouseEvent) {
		info('La edición de asientos todavía no está disponible.');
	}

	moveButton(event: MouseEvent) {
		if (this.isDragging && this.activeButtonIndex !== null) {
			const rect = this.imageContainer.nativeElement.getBoundingClientRect();
			const btnWidth = 80;
			const btnHeight = 40;

			let newX = event.clientX - rect.left - this.offsetX;
			let newY = event.clientY - rect.top - this.offsetY;

			newX = Math.max(0, Math.min(rect.width - btnWidth, newX));
			newY = Math.max(0, Math.min(rect.height - btnHeight, newY));
			const idx = this.activeButtonIndex;
			const current = this.area();
			if (current) {
				this.area.set({ ...current, seats: current.seats.map((s, i) => (i === idx ? { ...s, x: newX, y: newY } : s)) });
			}
		}
	}

	startDragging(index: number, event: MouseEvent) {
		this.isDragging = true;
		this.activeButtonIndex = index;

		const rect = (event.target as HTMLElement).getBoundingClientRect();
		this.offsetX = event.clientX - rect.left;
		this.offsetY = event.clientY - rect.top;
	}

	stopDragging() {
		this.isDragging = false;
		this.activeButtonIndex = null;
	}
}
