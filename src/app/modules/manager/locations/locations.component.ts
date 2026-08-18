import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import * as bootstrap from 'bootstrap';
import { UpdateLocationModalComponent } from './components/update-location-modal/update-location-modal.component';
import { Location } from '../../../models/locations/location';
import { LocationsService } from './services/locations.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
	selector: 'app-locations',
	imports: [UpdateLocationModalComponent],
	template: `
		<h2 class="section-title">Sedes</h2>
		<p class="text-body-secondary small">Sucursales de tu organización — cada evento y cada usuario puede quedar asignado a una.</p>
		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search" (submit)="$event.preventDefault(); searchText.set(searchInput.value)">
					<button type="button" class="btn btn-primary me-4" (click)="openUpdateLocationModal(null)">Crear</button>
					<input #searchInput class="form-control me-2" type="search" placeholder="Buscar" aria-label="Nombre" (input)="searchText.set(searchInput.value)" />
					<button class="btn btn-dark" type="submit">Buscar</button>
				</form>
			</div>
		</nav>
		<br />

		<table class="table table-hover table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">Nombre</th>
					<th scope="col">Dirección</th>
					<th scope="col">Estado</th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				@for (location of filteredLocations(); track location.id) {
					<tr>
						<td>{{ location.name }}</td>
						<td>{{ location.address || '—' }}</td>
						<td>
							@if (location.active) {
								<span class="badge text-bg-success">Activa</span>
							} @else {
								<span class="badge text-bg-secondary">Inactiva</span>
							}
						</td>
						<td class="text-end text-nowrap">
							<button type="button" class="btn btn-dark btn-sm rounded-circle me-1" (click)="openUpdateLocationModal(location)"><i class="bi bi-pencil"></i></button>
							<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteLocation(location)"><i class="bi bi-x-lg"></i></button>
						</td>
					</tr>
				} @empty {
					<tr>
						<td colspan="4" class="text-body-secondary text-center py-4">Todavía no diste de alta ninguna sede.</td>
					</tr>
				}
			</tbody>
		</table>

		<app-update-location-modal [location]="selectedLocation()" (locationSaved)="loadLocations()" />
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationsComponent implements AfterViewInit {
	private readonly locationsService = inject(LocationsService);

	locations = signal<Location[]>([]);
	selectedLocation = signal<Location | null>(null);
	searchText = signal('');
	private locationUpdateModal: any;

	filteredLocations = computed(() => {
		const term = this.searchText().trim().toLowerCase();
		if (!term) return this.locations();
		return this.locations().filter((l) => [l.name, l.address].some((field) => field?.toLowerCase().includes(term)));
	});

	ngAfterViewInit(): void {
		this.locationUpdateModal = new bootstrap.Modal('#updateLocationModal', { backdrop: true });
		this.loadLocations();
	}

	loadLocations() {
		this.locationsService.getLocations().subscribe((locations) => this.locations.set(locations));
	}

	openUpdateLocationModal(location: Location | null) {
		this.selectedLocation.set(location);
		this.locationUpdateModal?.show();
	}

	deleteLocation(location: Location) {
		confirm(`¿Eliminar la sede "${location.name}"?`, {
			onConfirm: () =>
				this.locationsService.deleteLocation(location.id).subscribe({
					next: () => this.loadLocations(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				}),
		});
	}
}
