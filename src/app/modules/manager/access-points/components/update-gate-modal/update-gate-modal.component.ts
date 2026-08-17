import { ChangeDetectionStrategy, Component, effect, inject, Input, model, output, signal, computed } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessPoint } from '../../../../../models/access-points/access-point';
import { Ticket } from '../../../../../models/tickets/ticket';
import { AccessPointsService } from '../../services/access-points.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'app-update-gate-modal',
	imports: [ReactiveFormsModule, FormsModule],
	template: ` <div class="modal fade" id="updateGateModal" tabindex="-1" aria-labelledby="updateGateModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="updateGateModalLabel">{{ (gate()?.id ?? 0) > 0 ? 'Editar' : 'Crear' }} puerta</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" novalidate="" [formGroup]="form">
						<div class="mb-3">
							<label for="name">Nombre *</label>
							<select class="custom-select d-block w-100 mb-2" [class.is-invalid]="isInvalid('name')" [ngModel]="selectedPreset()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="onPresetChange($event)">
								<option value="">Elegir...</option>
								@for (preset of gateNamePresets; track preset) {
									<option [value]="preset">{{ preset }}</option>
								}
								<option value="__custom__">Otra...</option>
							</select>
							@if (usingCustomName()) {
								<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" placeholder="Nombre de la puerta" />
							}
							@if (isInvalid('name')) {
								<div class="invalid-feedback d-block">El nombre es obligatorio.</div>
							}
						</div>
						<div class="mb-3">
							<label>Tickets permitidos</label>
							<div class="form-text mb-2">Sin marcar ninguno, esta puerta deja pasar cualquier tipo de ticket.</div>
							@if (!availableTickets.length) {
								<p class="text-body-secondary small">Este evento todavía no tiene tickets creados.</p>
							} @else {
								@for (ticket of availableTickets; track ticket.id) {
									<div class="form-check">
										<input class="form-check-input" type="checkbox" [id]="'gate-ticket-' + ticket.id" [checked]="isTicketChecked(ticket.id)" (change)="toggleTicket(ticket.id, $event)" />
										<label class="form-check-label" [for]="'gate-ticket-' + ticket.id">{{ ticket.name }}</label>
									</div>
								}
							}
						</div>
						<div class="mb-3">
							<label for="state">Estado</label>
							<select class="custom-select d-block w-100" formControlName="active">
								@for (status of activeList; track status.label) {
									<option [ngValue]="status.value">{{ status.label }}</option>
								}
							</select>
						</div>
						@if (errorMessage) {
							<div class="text-danger">{{ errorMessage }}</div>
						}
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Cerrar</button>
					<button type="button" class="btn btn-primary btn-sm" (click)="save()">
						<i class="bi bi-floppy-fill" aria-hidden="true"></i> {{ (gate()?.id ?? 0) > 0 ? 'Guardar' : 'Crear' }}
					</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateGateModalComponent {
	private readonly accessPointsService = inject(AccessPointsService);

	gate = model<AccessPoint | null>(null);
	@Input() defaultEventId: number | null = null;
	@Input() availableTickets: Ticket[] = [];
	gateSaved = output<void>();
	errorMessage = '';

	selectedTicketIds = new Set<number>();

	// Nombres estándar sugeridos — cubren el caso común sin bloquear tenants con puertas que no
	// encajan en ninguno de estos (ej. "Puerta 3", numeración propia del recinto), de ahí la opción
	// "Otra...".
	gateNamePresets = ['Entrada Principal', 'Entrada Trasera', 'Entrada VIP', 'Entrada Staff'];
	// Espejo del select — separado del FormControl name porque el select necesita distinguir "vacío
	// sin elegir" de "__custom__" (mostrar el input de texto libre), algo que el propio valor de
	// `name` no puede representar sin ambigüedad.
	selectedPreset = signal('');
	usingCustomName = computed(() => this.selectedPreset() === '__custom__');

	activeList: { label: string; value: boolean }[] = [
		{ label: 'Activo', value: true },
		{ label: 'Inactivo', value: false },
	];

	form = new FormGroup({
		name: new FormControl<string | null>(null, Validators.required),
		active: new FormControl<boolean>(true, [Validators.required]),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const current = this.gate();
			if (current) {
				this.form.patchValue({ name: current.name, active: current.active });
				this.selectedTicketIds = new Set(current.ticketIds);
				this.selectedPreset.set(this.gateNamePresets.includes(current.name) ? current.name : '__custom__');
			} else {
				this.form.reset({ active: true });
				this.selectedTicketIds = new Set();
				this.selectedPreset.set('');
			}
		});
	}

	onPresetChange(value: string) {
		this.selectedPreset.set(value);
		this.form.controls.name.setValue(value && value !== '__custom__' ? value : null);
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	isTicketChecked(ticketId: number): boolean {
		return this.selectedTicketIds.has(ticketId);
	}

	toggleTicket(ticketId: number, event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		if (checked) {
			this.selectedTicketIds.add(ticketId);
		} else {
			this.selectedTicketIds.delete(ticketId);
		}
	}

	save() {
		if (this.form.invalid || !this.defaultEventId) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		const payload = {
			name: value.name!,
			active: value.active!,
			eventId: this.defaultEventId,
			ticketIds: [...this.selectedTicketIds],
		};

		const current = this.gate();
		const request = current ? this.accessPointsService.updateAccessPoint(current.id, payload) : this.accessPointsService.createAccessPoint(payload);

		request.subscribe({
			next: () => {
				this.gateSaved.emit();
				this.gate.set(null);
				this.errorMessage = '';
				closeModal('updateGateModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
