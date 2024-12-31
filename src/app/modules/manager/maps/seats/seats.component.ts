import { ChangeDetectionStrategy, Component, ViewChild, OnInit, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { maps } from '../../../../data/map';
import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { Seat } from '../../../../models/maps/seat';
import { NavBarMapComponent } from "../components/nav-bar-map/nav-bar-map.component";
import { CollapseSeatsComponent } from "../components/collapse-seats/collapse-seats.component";
import { CollapseTablesComponent } from "../components/accordion-tables/collapse-tables.component";
@Component({
	selector: 'app-seats',
	imports: [NavBarMapComponent, CollapseSeatsComponent, CollapseTablesComponent],
	template: `
		<nav-bar-map [areas]="map?.areas" [idMap]="map?.id" />
		<div class="col-xxl-9 col-md-12 ">
			<h3>Manager Seat</h3>
		</div>
		<div class="scroll-map">
			<div class="row">
				<div class="col-xxl-9 col-md-12 bg-black">
					@if (area?.img) {
						<div class="scrollimg">
							<div class="container">
								<div class="image-container " class="image-container " #imageContainer (mousemove)="moveButton($event)">
									<img #image [src]="area?.img" class="background-image" (dblclick)="openCreateSeatForm($event)" />
									@for (seat of area?.seats; track seat.id; let idx = $index) {
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
											<span> </span>
										</div>
									}
									<!-- @for (table of area?.tables; track table.id; let idx = $index) {
										<div class="draggable-btn" (mousedown)="startDragging(idx, $event)" (mouseup)="stopDragging()" (mouseleave)="stopDragging()" [style.top.px]="table.y" [style.left.px]="table.x">
											@if (table.icon) {
												<div class="row">
													<div class="col-12">
														<span [style.color]="table.color" [style.font-size.px]="table.size * 0.5">
															{{ table.name }}
														</span>
													</div>
													<div class="col-12">
														<i [class]="'bi ' + table.icon + ' shadow-sm p-1 mb-2  rounded'" [style.color]="table.color" [style.font-size.px]="table.size"></i>
													</div>
												</div>
											}
											<span> </span>
										</div>
									} -->
								</div>
							</div>
						</div>
					}
				</div>
				<br />
				@if (area) {
					<div class="col-xxl-3 col-gl-12 col-md-12">
						<div class="scroll-list">
							<div class="card">
								<div class="card-header">
									<div class="d-flex flex-row  justify-content-between">
										<div class="p-2">
											@if (area.icon) {
												<i class="bi {{ area.icon }}"></i>
											}
											{{ area.name }}

											<button type="button" class="btn btn-dark btn-sm rounded-circle ms-2">
												<i class=" bi bi-pencil "></i>
											</button>
										</div>
										<div class="p-2"></div>
										<div class="p-2"></div>
										<div class="p-2">
											<button type="button" class="btn btn-sm "><i class="bi bi-x-lg"></i></button>
										</div>
									</div>
								</div>
								<ul class="list-group list-group-flush">
									<collapse-seats [seats]="area.seats" [id]="area.id" />
									<collapse-tables [tables]="area.tables" [id]="area.id" />
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
	openCreateSeatForm($event: MouseEvent) {
		throw new Error('Method not implemented.');
	}
	openUpdateSeatForm(_t13: Seat) {
		throw new Error('Method not implemented.');
	}
	map: Map | undefined;
	area: Area | undefined;

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
		this.initInfo();
	}
	getMapArea(idMap: number, idArea: number) {
		if (maps) {
			for (var i = 0; i < maps.length; i++) {
				if (maps[i].id === idMap) {
					this.map = maps[i];
					for (var j = 0; j < maps[i].areas.length; j++) {
						if (maps[i].areas[j].id === idArea) {
							this.area = maps[i].areas[j];
							break;
						}
					}
					break;
				}
			}
		}
	}
	initInfo() {
		this.route.paramMap.subscribe((params) => {
			var idMap = params.get('id_map');
			var idArea = params.get('id_area');

			if (idMap && idArea) {
				this.getMapArea(parseInt(idMap), parseInt(idArea));
			} else {
				this['router'].navigate(['/manager/maps']);
			}
		});
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
			if (this.area?.seats) {
				var seats = this.area.seats;
				seats[this.activeButtonIndex].x = newX;
				seats[this.activeButtonIndex].y = newY;
				this.area.seats = seats;
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
