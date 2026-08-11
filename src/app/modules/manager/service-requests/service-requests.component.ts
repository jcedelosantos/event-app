import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-requests/service-request';
import { ServiceRequestsService } from './services/service-requests.service';
import { CreateServiceRequestModalComponent } from './components/create-service-request-modal/create-service-request-modal.component';

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
	PENDING: 'Pendiente',
	QUOTED: 'Cotizado',
	FULFILLED: 'Resuelto',
	REJECTED: 'Rechazado',
};

const STATUS_BADGE_CLASS: Record<ServiceRequestStatus, string> = {
	PENDING: 'text-bg-secondary',
	QUOTED: 'text-bg-info',
	FULFILLED: 'text-bg-success',
	REJECTED: 'text-bg-danger',
};

@Component({
	selector: 'app-service-requests',
	imports: [CreateServiceRequestModalComponent, DatePipe, DecimalPipe],
	template: `
		<h2 class="section-title">Servicios adicionales</h2>
		<p class="text-muted">
			Renta de equipos, personal presencial, conectividad y más — el equipo cotiza y coordina a partir de tu solicitud, no se cobra nada automático.
		</p>

		<button type="button" class="btn btn-danger mb-3" data-bs-toggle="modal" data-bs-target="#createServiceRequestModal">
			<i class="bi bi-plus-lg"></i> Nueva solicitud
		</button>

		@if (requests().length) {
			<table class="table">
				<thead>
					<tr>
						<th>Fecha</th>
						<th>Evento</th>
						<th>Servicios</th>
						<th class="text-end">Total estimado</th>
						<th>Estado</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					@for (r of requests(); track r.id) {
						<tr>
							<td>{{ r.createdAt | date: 'short' }}</td>
							<td>{{ r.event?.name ?? '—' }}</td>
							<td>
								@for (item of r.items; track item.id) {
									<div class="small">{{ item.nameSnapshot }} × {{ item.quantity }}</div>
								}
							</td>
							<td class="text-end">$ {{ r.totalDOP | number }}</td>
							<td>
								<span class="badge" [class]="statusBadgeClass(r.status)">{{ statusLabel(r.status) }}</span>
								@if (r.resolutionNote) {
									<div class="small text-muted mt-1">{{ r.resolutionNote }}</div>
								}
							</td>
							<td>
								@if (r.status === 'PENDING') {
									<button
										type="button"
										class="btn btn-sm btn-outline-light"
										data-bs-toggle="modal"
										data-bs-target="#createServiceRequestModal"
										(click)="requestToEdit.set(r)"
									>
										<i class="bi bi-pencil"></i> Editar
									</button>
								}
							</td>
						</tr>
					}
				</tbody>
			</table>
		} @else {
			<p class="text-body-secondary">Todavía no enviaste ninguna solicitud.</p>
		}

		<app-create-service-request-modal [(request)]="requestToEdit" (requestSaved)="loadRequests()" />
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceRequestsComponent implements OnInit, AfterViewInit {
	private readonly serviceRequestsSrv = inject(ServiceRequestsService);

	requests = signal<ServiceRequest[]>([]);
	requestToEdit = signal<ServiceRequest | null>(null);

	ngOnInit(): void {
		this.loadRequests();
	}

	// Solo el modal "Nueva solicitud" no pasa por (click)="requestToEdit.set(r)" — sin este listener,
	// cerrar una edición y después abrir "Nueva solicitud" mostraría el modal todavía precargado con
	// la solicitud anterior (mismo patrón que eventToEdit en events.component.ts).
	ngAfterViewInit(): void {
		const modalEl = document.getElementById('createServiceRequestModal');
		modalEl?.addEventListener('hidden.bs.modal', () => this.requestToEdit.set(null));
	}

	loadRequests() {
		this.serviceRequestsSrv.getMine().subscribe((requests) => this.requests.set(requests));
	}

	statusLabel(status: ServiceRequestStatus): string {
		return STATUS_LABEL[status];
	}

	statusBadgeClass(status: ServiceRequestStatus): string {
		return STATUS_BADGE_CLASS[status];
	}
}
