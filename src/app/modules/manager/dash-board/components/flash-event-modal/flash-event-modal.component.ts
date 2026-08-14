import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EventsService } from '../../../events/services/events.service';
import { Events } from '../../../../../models/events/events';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

// Alta rápida de 3 campos para un evento de último momento — el resto de los campos quedan en sus
// defaults razonables (fecha = hoy, tipo = Normal, sin mapa) y el evento queda 100% editable
// después desde Event Details, a donde se navega apenas se crea, igual que cualquier evento creado
// con el form completo (create-event-modal).
@Component({
	selector: 'app-flash-event-modal',
	standalone: true,
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="flashEventModal" tabindex="-1" aria-labelledby="flashEventModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<form [formGroup]="form" (ngSubmit)="submit()">
						<div class="modal-header">
							<h1 class="modal-title fs-5" id="flashEventModalLabel">Evento flash</h1>
							<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
						</div>
						<div class="modal-body">
							<p class="text-body-secondary small">Cargá lo mínimo ahora — el resto (mapa, tickets, fecha exacta) lo completás después desde la ficha del evento.</p>
							<div class="mb-3">
								<label for="flashName" class="form-label small">Nombre del evento</label>
								<input type="text" id="flashName" class="form-control" formControlName="name" [class.is-invalid]="isInvalid('name')" placeholder="Ej. Noche de trivia" />
							</div>
							<div class="mb-3">
								<label for="flashPlace" class="form-label small">Lugar <span class="text-muted">(opcional)</span></label>
								<input type="text" id="flashPlace" class="form-control" formControlName="place" placeholder="Ej. Salón principal" />
							</div>
							<div class="mb-3">
								<label for="flashCapacity" class="form-label small">Cantidad de personas esperada <span class="text-muted">(opcional)</span></label>
								<input type="number" id="flashCapacity" class="form-control" formControlName="capacity" min="1" placeholder="Sin tope si lo dejás vacío" />
							</div>
							@if (errorMessage()) {
								<div class="alert alert-danger mb-0">{{ errorMessage() }}</div>
							}
						</div>
						<div class="modal-footer">
							<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
							<button type="submit" class="btn btn-danger" [disabled]="submitting()">
								@if (submitting()) {
									Creando...
								} @else {
									Crear evento
								}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashEventModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly eventsService = inject(EventsService);
	private readonly router = inject(Router);

	@Output() eventCreated = new EventEmitter<Events>();

	submitting = signal(false);
	errorMessage = signal('');

	form = this.fb.group({
		name: this.fb.control('', Validators.required),
		place: this.fb.control(''),
		capacity: this.fb.control<number | null>(null, Validators.min(1)),
	});

	isInvalid(control: 'name'): boolean {
		const c = this.form.controls[control];
		return c.invalid && c.touched;
	}

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}
		this.errorMessage.set('');
		this.submitting.set(true);
		const { name, place, capacity } = this.form.getRawValue();

		this.eventsService
			.createEvent({
				name: name!.trim(),
				description: place?.trim() ? place.trim() : '',
				type: 'Normal',
				dateOn: new Date(),
				maxCapacity: capacity ?? null,
			})
			.subscribe({
				next: (event) => {
					this.submitting.set(false);
					this.eventCreated.emit(event);
					this.form.reset({ name: '', place: '', capacity: null });
					closeModal('flashEventModal');
					this.router.navigate(['/manager/events', event.id]);
				},
				error: (err: HttpErrorResponse) => {
					this.submitting.set(false);
					this.errorMessage.set(extractErrorMessage(err));
				},
			});
	}
}
