import { ChangeDetectionStrategy, Component, effect, inject, model, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ServiceRequest, ServiceRequestStatus } from '../../../../models/service-requests/service-request';
import { ServiceRequestsAdminService } from '../../services/service-requests-admin.service';
import { extractErrorMessage } from '../../../../utils/api-error';
import { closeModal } from '../../../../utils/modal';

const STATUS_OPTIONS: Array<{ value: ServiceRequestStatus; label: string }> = [
	{ value: 'PENDING', label: 'Pendiente' },
	{ value: 'QUOTED', label: 'Cotizado' },
	{ value: 'FULFILLED', label: 'Resuelto' },
	{ value: 'REJECTED', label: 'Rechazado' },
];

@Component({
	selector: 'app-service-requests-admin-modal',
	imports: [ReactiveFormsModule, DecimalPipe],
	template: `<div class="modal fade" id="serviceRequestsAdminModal" tabindex="-1" aria-labelledby="serviceRequestsAdminModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="serviceRequestsAdminModalLabel">Solicitud — {{ request()?.tenant?.name }}</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					@if (request(); as r) {
						<p class="text-muted small mb-1">{{ r.event?.name ?? 'Sin evento específico' }}</p>
						<ul class="list-unstyled small mb-2">
							@for (item of r.items; track item.id) {
								<li>{{ item.nameSnapshot }} × {{ item.quantity }}</li>
							}
						</ul>
						<p class="fw-bold">Total estimado: RD$ {{ r.totalDOP | number }}</p>
						@if (r.notes) {
							<p class="small text-muted">Notas del cliente: {{ r.notes }}</p>
						}

						<form [formGroup]="form">
							<div class="mb-3">
								<label for="status">Estado</label>
								<select class="form-select" formControlName="status">
									@for (opt of statusOptions; track opt.value) {
										<option [ngValue]="opt.value">{{ opt.label }}</option>
									}
								</select>
							</div>
							<div class="mb-3">
								<label for="resolutionNote">Nota de resolución <span class="text-muted">(opcional)</span></label>
								<textarea class="form-control" formControlName="resolutionNote" rows="3" placeholder="Cotización enviada, coordinación acordada, etc."></textarea>
							</div>
						</form>
					}
					@if (errorMessage) {
						<div class="text-danger">{{ errorMessage }}</div>
					}
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Cerrar</button>
					<button type="button" class="btn btn-primary btn-sm" (click)="save()"><i class="bi bi-floppy-fill"></i> Guardar</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServiceRequestsAdminModalComponent {
	private readonly serviceRequestsAdminSrv = inject(ServiceRequestsAdminService);

	request = model<ServiceRequest | null>(null);
	requestUpdated = output<void>();
	errorMessage = '';
	statusOptions = STATUS_OPTIONS;

	form = new FormGroup({
		status: new FormControl<ServiceRequestStatus>('PENDING'),
		resolutionNote: new FormControl<string>(''),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const current = this.request();
			this.form.reset({ status: current?.status ?? 'PENDING', resolutionNote: current?.resolutionNote ?? '' });
		});
	}

	save() {
		const current = this.request();
		if (!current) return;
		const value = this.form.getRawValue();
		this.serviceRequestsAdminSrv.updateStatus(current.id, value.status ?? 'PENDING', value.resolutionNote ?? undefined).subscribe({
			next: () => {
				this.requestUpdated.emit();
				this.request.set(null);
				this.errorMessage = '';
				closeModal('serviceRequestsAdminModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
