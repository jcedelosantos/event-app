import { ChangeDetectionStrategy, Component, ViewChild, OnInit, AfterViewInit, ElementRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { Seat } from '../../../../models/maps/seat';
import { NavBarMapComponent } from '../components/nav-bar-map/nav-bar-map.component';
import { CollapseTablesComponent } from '../components/accordion-tables/collapse-tables.component';
import { CreateSeatModalComponent } from '../components/create-seat-modal/create-seat-modal.component';
import { MapsService } from '../services/maps.service';
import { AreasService } from '../services/areas.service';
import { SeatsService } from '../services/seats.service';
import { confirm } from '../../../../utils/messages';

declare const bootstrap: any;

@Component({
	selector: 'app-seats',
	imports: [NavBarMapComponent, CollapseTablesComponent, CreateSeatModalComponent],
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
									@for (seat of seats(); track seat.id; let idx = $index) {
										<button
											class="draggable-btn"
											(dblclick)="openUpdateSeatForm(seat)"
											(mousedown)="startDragging(idx, $event)"
											(mouseup)="stopDragging()"
											(mouseleave)="stopDragging()"
											[style.top.px]="seat.y"
											[style.left.px]="seat.x"
											[style.background]="'transparent'"
											[style.border]="'none'"
										>
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
											} @else {
												<span [style.color]="seat.color" [style.font-size.px]="seat.size * 0.8">{{ seat.name }}</span>
											}
										</button>
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
									@for (seat of seats(); track seat.id) {
										<li class="list-group-item d-flex justify-content-between align-items-center">
											{{ seat.name }}
											<div>
												<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" (click)="openUpdateSeatForm(seat)"><i class="bi bi-pencil"></i></button>
												<button type="button" class="btn btn-sm" (click)="deleteSeat(seat)"><i class="bi bi-x-lg"></i></button>
											</div>
										</li>
									} @empty {
										<li class="list-group-item text-muted">Sin asientos — doble click sobre la imagen para crear uno.</li>
									}
									<collapse-tables [tables]="a.tables" [id]="a.id" />
								</ul>
							</div>
							<br />
						</div>
					</div>
				}
			</div>
		</div>

		<create-seat-modal [(seat)]="seatToEdit" [areaId]="area()?.id" [coordinates]="coordinates" (seatCreated)="onSeatCreated($event)" (seatUpdated)="onSeatUpdated($event)" />
	`,
	styleUrl: './seats.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatsComponent implements OnInit, AfterViewInit {
	private readonly mapsService = inject(MapsService);
	private readonly areasService = inject(AreasService);
	private readonly seatsService = inject(SeatsService);

	map = signal<Map | undefined>(undefined);
	area = signal<Area | undefined>(undefined);
	seats = signal<Seat[]>([]);
	seatToEdit = signal<Seat | null>(null);
	coordinates = { x: 0, y: 0 };

	isDragging = false;
	activeButtonIndex: number | null = null;
	offsetX = 0;
	offsetY = 0;

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
				next: (area) => {
					this.area.set(area);
					this.loadSeats(area.id);
				},
				error: () => this.router.navigate(['/manager/maps/' + idMap + '/areas']),
			});
		});
	}

	ngAfterViewInit(): void {
		const modalEl = document.getElementById('createSeatModal');
		modalEl?.addEventListener('hidden.bs.modal', () => this.seatToEdit.set(null));
	}

	loadSeats(areaId: number) {
		this.seatsService.getSeatsByArea(areaId).subscribe((seats) => this.seats.set(seats));
	}

	openCreateSeatForm(event: MouseEvent) {
		const rect = this.imageContainer.nativeElement.getBoundingClientRect();
		const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

		this.seatToEdit.set(null);
		this.coordinates = { x: Math.round(x), y: Math.round(y) };
		const modalEl = document.getElementById('createSeatModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	openUpdateSeatForm(seat: Seat) {
		this.seatToEdit.set(seat);
		const modalEl = document.getElementById('createSeatModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).show();
		}
	}

	onSeatCreated(seat: Seat) {
		this.seats.update((list) => [...list, seat]);
	}

	onSeatUpdated(seat: Seat) {
		this.seats.update((list) => list.map((s) => (s.id === seat.id ? seat : s)));
	}

	deleteSeat(seat: Seat) {
		confirm(`¿Eliminar el asiento "${seat.name}"?`, {
			onConfirm: () => {
				this.seatsService.deleteSeat(seat.id).subscribe(() => {
					this.seats.update((list) => list.filter((s) => s.id !== seat.id));
				});
			},
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

			const idx = this.activeButtonIndex;
			this.seats.update((list) => list.map((s, i) => (i === idx ? { ...s, x: newX, y: newY } : s)));
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
			const seat = this.seats()[this.activeButtonIndex];
			this.seatsService.updateSeat(seat.id, { x: seat.x, y: seat.y }).subscribe();
		}
		this.isDragging = false;
		this.activeButtonIndex = null;
	}
}
