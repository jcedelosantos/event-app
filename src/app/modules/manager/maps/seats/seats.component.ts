import { ChangeDetectionStrategy, Component, ViewChild, OnInit, AfterViewInit, ElementRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { Seat } from '../../../../models/maps/seat';
import { Table } from '../../../../models/maps/table';
import { NavBarMapComponent } from '../components/nav-bar-map/nav-bar-map.component';
import { CollapseTablesComponent } from '../components/accordion-tables/collapse-tables.component';
import { CreateSeatModalComponent } from '../components/create-seat-modal/create-seat-modal.component';
import { BulkCreateSeatsModalComponent } from '../components/bulk-create-seats-modal/bulk-create-seats-modal.component';
import { MapsService } from '../services/maps.service';
import { AreasService } from '../services/areas.service';
import { SeatsService } from '../services/seats.service';
import { TablesService } from '../services/tables.service';
import { confirm, error } from '../../../../utils/messages';
import { extractErrorMessage } from '../../../../utils/api-error';
import { shortSeatLabel } from '../../../../utils/seat-label';
import { HttpErrorResponse } from '@angular/common/http';

declare const bootstrap: any;

@Component({
	selector: 'app-seats',
	imports: [NavBarMapComponent, CollapseTablesComponent, CreateSeatModalComponent, BulkCreateSeatsModalComponent],
	template: `
		<nav-bar-map [areas]="map()?.areas" [idMap]="map()?.id" />
		<div class="col-xxl-9 col-md-12 d-flex justify-content-between align-items-center">
			<h3>Manager Seat</h3>
			<div>
				<button type="button" class="btn btn-outline-danger btn-sm me-2" data-bs-toggle="modal" data-bs-target="#bulkCreateSeatsModal"><i class="bi bi-grid-3x3-gap"></i> Generar varios</button>
				<button type="button" class="btn btn-danger btn-sm" (click)="openCreateSeatModal()"><i class="bi bi-plus-lg"></i> Add Seat</button>
			</div>
		</div>
		<div class="scroll-map">
			<div class="row">
				<div class="col-xxl-9 col-md-12 bg-black">
					@if (area()?.img) {
						<div class="scrollimg">
							<div class="container">
								<div class="image-container " class="image-container " #imageContainer (mousemove)="moveActive($event)">
									<img #image [src]="area()?.img" class="background-image" (dblclick)="openCreateSeatForm($event)" />
									@for (table of tables(); track table.id; let idx = $index) {
										<button
											class="draggable-btn"
											(mousedown)="startDragging('table', idx, $event)"
											(mouseup)="stopDragging()"
											(mouseleave)="stopDragging()"
											[style.top.px]="table.y"
											[style.left.px]="table.x"
											[style.background]="'transparent'"
											[style.border]="'none'"
											[title]="table.name"
										>
											<div class="seat-icon-wrap">
												<i [class]="'bi ' + table.icon" [style.color]="table.color" [style.font-size.px]="table.size"></i>
												<span class="seat-icon-label" [style.font-size.px]="table.size * 0.32">{{ table.name }}</span>
											</div>
										</button>
									}
									@for (seat of seats(); track seat.id; let idx = $index) {
										<button
											class="draggable-btn"
											(dblclick)="openUpdateSeatForm(seat)"
											(mousedown)="startDragging('seat', idx, $event)"
											(mouseup)="stopDragging()"
											(mouseleave)="stopDragging()"
											[style.top.px]="seat.y"
											[style.left.px]="seat.x"
											[style.background]="'transparent'"
											[style.border]="'none'"
											[title]="seat.name"
										>
											@if (seat.icon) {
												<div class="seat-icon-wrap">
													<i [class]="'bi ' + seat.icon" [style.color]="seat.color" [style.font-size.px]="seat.size"></i>
													<span class="seat-icon-label" [style.font-size.px]="seat.size * 0.32">{{ seat.name }}</span>
												</div>
											} @else {
												<span [style.color]="seat.color" [style.font-size.px]="seat.size * 0.8">{{ seatLabel(seat) }}</span>
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
									@for (seat of ungroupedSeats(); track seat.id) {
										<li class="list-group-item d-flex justify-content-between align-items-center">
											{{ seat.name }}
											<div>
												<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" (click)="openUpdateSeatForm(seat)"><i class="bi bi-pencil"></i></button>
												<button type="button" class="btn btn-sm" (click)="deleteSeat(seat)"><i class="bi bi-x-lg"></i></button>
											</div>
										</li>
									} @empty {
										@if (!tables().length) {
											<li class="list-group-item text-muted">Sin asientos — usá el botón "Add Seat" arriba (o doble click sobre la imagen para ubicarlo en un punto exacto).</li>
										}
									}
									<collapse-tables [tables]="tablesWithSeats()" [id]="a.id" (deleteTable)="deleteTable($event)" />
								</ul>
							</div>
							<br />
						</div>
					</div>
				}
			</div>
		</div>

		<create-seat-modal [(seat)]="seatToEdit" [areaId]="area()?.id" [coordinates]="coordinates" (seatCreated)="onSeatCreated($event)" (seatUpdated)="onSeatUpdated($event)" />
		<bulk-create-seats-modal [areaId]="area()?.id" (seatsCreated)="onSeatsBulkCreated($event)" (tablesCreated)="onTablesBulkCreated($event)" />
	`,
	styleUrl: './seats.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatsComponent implements OnInit, AfterViewInit {
	private readonly mapsService = inject(MapsService);
	private readonly areasService = inject(AreasService);
	private readonly seatsService = inject(SeatsService);
	private readonly tablesService = inject(TablesService);

	map = signal<Map | undefined>(undefined);
	area = signal<Area | undefined>(undefined);
	seats = signal<Seat[]>([]);
	tables = signal<Table[]>([]);
	seatToEdit = signal<Seat | null>(null);
	coordinates = { x: 0, y: 0 };

	isDragging = false;
	activeKind: 'seat' | 'table' | null = null;
	activeIndex: number | null = null;
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
					this.loadTables(area.id);
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

	loadTables(areaId: number) {
		this.tablesService.getTablesByArea(areaId).subscribe((tables) => this.tables.set(tables));
	}

	seatLabel(seat: Seat): string {
		return shortSeatLabel(seat.name);
	}

	// Los asientos que no pertenecen a ninguna mesa se listan sueltos; los que sí, se ven agrupados
	// dentro de su mesa vía collapse-tables (evita una lista plana de 500 items para 50 mesas).
	ungroupedSeats() {
		return this.seats().filter((s) => !s.tableId);
	}

	tablesWithSeats(): Table[] {
		const seats = this.seats();
		return this.tables().map((table) => ({ ...table, seats: seats.filter((s) => s.tableId === table.id) }));
	}

	openCreateSeatForm(event: MouseEvent) {
		const rect = this.imageContainer.nativeElement.getBoundingClientRect();
		const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
		const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

		this.seatToEdit.set(null);
		this.coordinates = { x: Math.round(x), y: Math.round(y) };
		this.openCreateSeatModal();
	}

	openCreateSeatModal() {
		this.seatToEdit.set(null);
		this.coordinates = { x: 0, y: 0 };
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

	onSeatsBulkCreated(newSeats: Seat[]) {
		this.seats.update((list) => [...list, ...newSeats]);
	}

	onTablesBulkCreated(newTables: Table[]) {
		this.tables.update((list) => [...list, ...newTables]);
	}

	onSeatUpdated(seat: Seat) {
		this.seats.update((list) => list.map((s) => (s.id === seat.id ? seat : s)));
	}

	deleteSeat(seat: Seat) {
		confirm(`¿Eliminar el asiento "${seat.name}"?`, {
			onConfirm: () => {
				this.seatsService.deleteSeat(seat.id).subscribe({
					next: () => {
						this.seats.update((list) => list.filter((s) => s.id !== seat.id));
					},
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}

	deleteTable(table: Table) {
		confirm(`¿Eliminar la mesa "${table.name}" y sus ${table.seats.length} asiento(s)?`, {
			onConfirm: () => {
				this.tablesService.deleteTable(table.id).subscribe({
					next: () => {
						this.tables.update((list) => list.filter((t) => t.id !== table.id));
						this.seats.update((list) => list.filter((s) => s.tableId !== table.id));
					},
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}

	moveActive(event: MouseEvent) {
		if (!this.isDragging || this.activeIndex === null) return;

		const rect = this.imageContainer.nativeElement.getBoundingClientRect();
		const btnWidth = 80;
		const btnHeight = 40;

		let newX = event.clientX - rect.left - this.offsetX;
		let newY = event.clientY - rect.top - this.offsetY;

		newX = Math.max(0, Math.min(rect.width - btnWidth, newX));
		newY = Math.max(0, Math.min(rect.height - btnHeight, newY));

		const idx = this.activeIndex;
		if (this.activeKind === 'seat') {
			this.seats.update((list) => list.map((s, i) => (i === idx ? { ...s, x: newX, y: newY } : s)));
		} else if (this.activeKind === 'table') {
			const table = this.tables()[idx];
			const deltaX = newX - table.x;
			const deltaY = newY - table.y;
			// Arrastrar la mesa mueve también sus asientos en anillo, para no tener que reacomodar
			// cada silla a mano después de reubicar la mesa.
			this.tables.update((list) => list.map((t, i) => (i === idx ? { ...t, x: newX, y: newY } : t)));
			this.seats.update((list) => list.map((s) => (s.tableId === table.id ? { ...s, x: s.x + deltaX, y: s.y + deltaY } : s)));
		}
	}

	startDragging(kind: 'seat' | 'table', index: number, event: MouseEvent) {
		this.isDragging = true;
		this.activeKind = kind;
		this.activeIndex = index;

		const rect = (event.target as HTMLElement).getBoundingClientRect();
		this.offsetX = event.clientX - rect.left;
		this.offsetY = event.clientY - rect.top;
	}

	stopDragging() {
		if (this.isDragging && this.activeIndex !== null) {
			if (this.activeKind === 'seat') {
				const seat = this.seats()[this.activeIndex];
				this.seatsService.updateSeat(seat.id, { x: seat.x, y: seat.y }).subscribe();
			} else if (this.activeKind === 'table') {
				const table = this.tables()[this.activeIndex];
				this.tablesService.updateTable(table.id, { x: table.x, y: table.y }).subscribe();
				for (const seat of this.seats().filter((s) => s.tableId === table.id)) {
					this.seatsService.updateSeat(seat.id, { x: seat.x, y: seat.y }).subscribe();
				}
			}
		}
		this.isDragging = false;
		this.activeKind = null;
		this.activeIndex = null;
	}
}
