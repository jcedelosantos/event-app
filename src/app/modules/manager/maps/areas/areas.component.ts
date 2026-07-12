import { ChangeDetectionStrategy, Component, OnInit, ElementRef, ViewChild, AfterViewInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
declare var bootstrap: any;

import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { NavBarMapComponent } from '../components/nav-bar-map/nav-bar-map.component';
import { CollapseSeatsComponent } from '../components/collapse-seats/collapse-seats.component';
import { CollapseTablesComponent } from '../components/accordion-tables/collapse-tables.component';
import { CreateAreaComponent } from '../components/create-area/create-area.component';
import { UpdateAreaComponent } from '../components/update-area/update-area.component';
import { MapsService } from '../services/maps.service';
import { AreasService } from '../services/areas.service';
import { promptText, error, confirm } from '../../../../utils/messages';
import { extractErrorMessage } from '../../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
	selector: 'app-areas',
	imports: [DecimalPipe, NavBarMapComponent, CollapseTablesComponent, CreateAreaComponent, ReactiveFormsModule, UpdateAreaComponent, CollapseSeatsComponent],
	template: `
		<nav-bar-map [maps]="maps()" [idMap]="map()?.id" [areas]="areas()" />
		<div class="col-xxl-9 col-md-12 d-flex justify-content-between align-items-center">
			<h3 class="section-title mb-0">Manager Areas</h3>
			<button type="button" class="btn btn-danger btn-sm" (click)="openCreateAreaModal()"><i class="bi bi-plus-lg"></i> Add Area</button>
		</div>
		<div class="scroll-map">
			<div class="card">
				<div class="card-header">
					<h5>{{ map()?.name }}</h5>
				</div>
				<ul class="list-group list-group-flush">
					<div class="map-placeholder">
						<i class="bi bi-geo-alt-fill"></i>
						<span class="map-placeholder-coords">{{ center.lat | number: '1.4-4' }}, {{ center.lng | number: '1.4-4' }}</span>
					</div>
					<li class="list-group-item">
						<div class="row">
							<div class="col-5">
								<h6 class="card-title">{{ map()?.description }}</h6>
							</div>
							<div class="col-7">
								<div class="d-flex justify-content-end">
									<div class="bd-highlight me-4">
										Areas : <span class="badge text-bg-danger">{{ areas().length }}</span>
									</div>
									<div class="bd-highlight me-4">
										Mesas : <span class="badge text-bg-danger">{{ tableCount() }}</span>
									</div>
									<div class="bd-highlight me-">
										Asientos : <span class="badge text-bg-danger">{{ seatCount() }}</span>
									</div>
								</div>
							</div>
						</div>
					</li>
				</ul>

				@if (map()?.img) {
					<div class="scrollimg">
						<div class="image-container " #imageContainer (mousemove)="moveButton($event)">
							<img #image [src]="map()?.img" class="background-image" (dblclick)="openCreateAreaForm($event)" />
							@for (area of areas(); track area.id; let idx = $index) {
								<button
									class="draggable-btn "
									(dblclick)="routeArea(area)"
									(mousedown)="startDragging(idx, $event)"
									(mouseup)="stopDragging()"
									(mouseleave)="stopDragging()"
									[style.color]="area.color"
									[style.background]="area.backGround"
									[style.font-size.px]="area.size"
									[style.top.px]="area.y"
									[style.left.px]="area.x"
								>
									@if (area.icon) {
										<i class="bi {{ area.icon }}"></i>
									}
									<span [style.font-size.px]="area.size * 0.8">
										{{ area.name }}
									</span>
									<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="openUpdateAreaForm(area)">
										<i class="bi bi-pencil"></i>
									</button>
								</button>
							}
						</div>
					</div>
				}

				<div class="card-body border-top">
					<h6 class="mb-3">Áreas de "{{ map()?.name }}"</h6>
					<div class="scroll-list">
						@if (!areas().length) {
							<p class="text-muted">Sin áreas — usá el botón "Add Area" arriba para crear la primera.</p>
						}
						<div class="row">
							@for (area of areas(); track area.id; let idx = $index) {
								<div class="col-xxl-4 col-md-6 mb-3">
									<div class="card h-100">
										<div class="card-header">
											<div class="d-flex flex-row  justify-content-between">
												<div class="p-2">
													<button type="button" class="btn btn-outline-danger btn-sm me-2" (click)="routeArea(area)">
														@if (area.icon) {
															<i class="bi {{ area.icon }}"></i>
														}
														{{ area.name }}
													</button>
													<button type="button" class="btn btn-dark btn-sm rounded-circle"><i class=" bi bi-pencil " (click)="openUpdateAreaForm(area)"></i></button>
													<button type="button" class="btn btn-dark btn-sm rounded-circle" title="Duplicar área" (click)="duplicateArea(area)"><i class="bi bi-copy"></i></button>
												</div>
												<div class="p-2">
													<button type="button" class="btn btn-sm " (click)="deleteArea(area)"><i class="bi bi-x-lg"></i></button>
												</div>
											</div>
										</div>
										<ul class="list-group list-group-flush">
											<collapse-seats [seats]="area.seats" [id]="idx" />
											<collapse-tables [tables]="area.tables" [id]="idx" />
											<li class="list-group-item"></li>
										</ul>
									</div>
								</div>
							}
						</div>
					</div>
				</div>
			</div>
		</div>

		<create-area [modal]="modalCreateArea" [coordinates]="coordinates" [mapId]="map()?.id" (createAreaEvent)="addArea($event.createArea)" />
		<update-area [modal]="modalUpdateArea" [area]="areaUpdate" (updateAreaEvent)="onAreaUpdated($event.updateArea)" />
	`,
	styleUrl: './areas.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreasComponent implements OnInit, AfterViewInit {
	private readonly mapsService = inject(MapsService);
	private readonly areasService = inject(AreasService);

	center: { lat: number; lng: number } = { lat: 18.4628068, lng: -70.0412847 };

	maps = signal<Map[]>([]);
	map = signal<Map | undefined>(undefined);
	areas = signal<Area[]>([]);

	isDragging = false;
	activeButtonIndex: number | null = null;
	offsetX = 0;
	offsetY = 0;
	imgWidth = 0;
	imgHeight = 0;

	@ViewChild('imageContainer') imageContainer!: ElementRef;
	@ViewChild('image') image!: ElementRef;

	modalCreateArea: any;
	coordinates = { x: 0.0, y: 0.0 };

	modalUpdateArea: any;
	areaUpdate: Area | undefined;

	tableCount(): number {
		return this.areas().reduce((sum, area) => sum + (area.tables?.length ?? 0), 0);
	}

	seatCount(): number {
		return this.areas().reduce((sum, area) => sum + (area.seats?.length ?? 0), 0);
	}

	constructor(
		private route: ActivatedRoute,
		private router: Router,
	) {}

	ngOnInit(): void {
		this.mapsService.getMaps().subscribe((maps) => this.maps.set(maps));
		this.route.paramMap.subscribe((params) => {
			const id = params.get('id');
			if (!id || Number.isNaN(Number(id))) {
				this.router.navigate(['/manager/maps']);
				return;
			}
			this.mapsService.getMap(Number(id)).subscribe({
				next: (map) => {
					this.map.set(map);
					this.areas.set(map.areas ?? []);
					this.center = { lat: map.x, lng: map.y };
				},
				error: () => this.router.navigate(['/manager/maps']),
			});
		});
	}

	ngAfterViewInit() {
		this.getSizeImg();
		this.getInitModal();
	}
	getSizeImg() {
		if (this.image && this.imageContainer) {
			this.imgWidth = this.image.nativeElement.naturalWidth;
			this.imgHeight = this.image.nativeElement.naturalHeight;
		}
	}
	getInitModal() {
		var modalElement = document.getElementById('createAreaModal');
		if (modalElement) {
			this.modalCreateArea = new bootstrap.Modal(modalElement);
		}
		modalElement = document.getElementById('updateAreaModal');
		if (modalElement) {
			this.modalUpdateArea = new bootstrap.Modal(modalElement);
		}
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
			this.areas.update((list) => list.map((a, i) => (i === idx ? { ...a, x: newX, y: newY } : a)));
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
		if (this.isDragging && this.activeButtonIndex !== null) {
			const area = this.areas()[this.activeButtonIndex];
			this.areasService.updateArea(area.id, { x: area.x, y: area.y }).subscribe();
		}
		this.isDragging = false;
		this.activeButtonIndex = null;
	}
	openCreateAreaModal() {
		this.modalCreateArea.show();
	}
	openUpdateAreaModal() {
		this.modalUpdateArea.show();
	}

	getMouseCoordinates(event: MouseEvent): { y: number; x: number } {
		const rect = this.imageContainer.nativeElement.getBoundingClientRect();
		let newX = event.clientX - rect.left - this.offsetX;
		let newY = event.clientY - rect.top - this.offsetY;

		newX = Math.max(0, Math.min(rect.width, newX));
		newY = Math.max(0, Math.min(rect.height, newY));

		this.offsetX = event.clientX - rect.left;
		this.offsetY = event.clientY - rect.top;

		return { y: this.offsetY, x: this.offsetX };
	}
	openCreateAreaForm(event: MouseEvent) {
		this.coordinates = this.getMouseCoordinates(event);
		this.openCreateAreaModal();
	}

	addArea(area: Area) {
		this.areas.update((list) => [...list, area]);
	}

	openUpdateAreaForm(area: Area) {
		this.areaUpdate = area;
		this.openUpdateAreaModal();
	}

	onAreaUpdated(updateArea: Area) {
		this.areas.update((list) => list.map((a) => (a.id === updateArea.id ? updateArea : a)));
	}

	deleteArea(area: Area) {
		confirm(`¿Eliminar el área "${area.name}"?`, {
			onConfirm: () => {
				this.areasService.deleteArea(area.id).subscribe({
					next: () => {
						this.areas.update((list) => list.filter((a) => a.id !== area.id));
					},
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}

	async duplicateArea(area: Area) {
		const name = await promptText('Nombre de la copia', `${area.name} (copia)`);
		if (!name) return;

		this.areasService.duplicateArea(area.id, name).subscribe((newArea) => {
			this.areas.update((list) => [...list, newArea]);
		});
	}

	routeArea(area: Area) {
		const map = this.map();
		if (map) {
			this.router.navigate(['/manager/maps/' + map.id + '/areas/' + area.id]);
		}
	}
}
