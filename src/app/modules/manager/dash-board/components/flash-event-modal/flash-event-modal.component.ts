import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EventsService } from '../../../events/services/events.service';
import { Events } from '../../../../../models/events/events';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { AuthService } from '../../../../../core/services/auth.service';
import { PLAN_FEATURES } from '../../../../../shared/pricing-plans';
import { isEventPlanCode } from '../../../../../shared/event-plans';

// Alta rápida para un evento de último momento — nombre, descripción, fecha, lugar y hora son
// opcionales salvo el nombre (fecha/hora caen a "ahora" si se dejan vacíos, ver submit()); el
// resto de los campos (mapa, tickets, etc.) quedan en sus defaults razonables y el evento queda
// 100% editable después desde Event Details, a donde se navega apenas se crea, igual que
// cualquier evento creado con el form completo (create-event-modal).
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
							<p class="text-body-secondary small">Cargá lo mínimo ahora — el resto (mapa, tickets) lo completás después desde la ficha del evento.</p>
							<div class="mb-3">
								<label for="flashName" class="form-label small">Nombre del evento</label>
								<input type="text" id="flashName" class="form-control" formControlName="name" [class.is-invalid]="isInvalid('name')" placeholder="Ej. Noche de trivia" />
							</div>
							<div class="mb-3">
								<label for="flashDescription" class="form-label small">Descripción <span class="text-muted">(opcional)</span></label>
								<textarea id="flashDescription" class="form-control" formControlName="description" rows="2" placeholder="Ej. Trivia por equipos, premio para el ganador"></textarea>
							</div>
							<div class="row g-2 mb-3">
								<div class="col-sm-6">
									<label for="flashDate" class="form-label small field-label-2l">Fecha <span class="text-muted">(opcional, hoy si se deja vacío)</span></label>
									<input type="date" id="flashDate" class="form-control" formControlName="date" />
								</div>
								<div class="col-sm-6">
									<label for="flashTime" class="form-label small field-label-2l">Hora <span class="text-muted">(opcional)</span></label>
									<input type="time" id="flashTime" class="form-control" formControlName="time" />
								</div>
							</div>
							<div class="mb-3">
								<label for="flashPlace" class="form-label small">Lugar <span class="text-muted">(opcional)</span></label>
								<input type="text" id="flashPlace" class="form-control" formControlName="place" placeholder="Ej. Salón principal" />
							</div>
							@if (capacityBlocked()) {
								<div class="alert alert-warning small text-start mb-3">
									<i class="bi bi-lock-fill" aria-hidden="true"></i>
									Tu plan actual no incluye aforo máximo — este campo no va a tener efecto hasta que actualices a un plan Avanzado o superior.
								</div>
							}
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
	styles: [
		`
			/* Fecha/Hora tienen labels de distinto largo ("Fecha (opcional, hoy si se deja vacío)" vs
			   "Hora (opcional)") — sin esto el input de una columna quedaba más arriba que el de la
			   otra (bug real reportado). Alto fijo de 2 líneas reserva siempre el mismo espacio,
			   tenga el label 1 línea o 2 (mismo criterio que create-event-modal).
			*/
			.field-label-2l {
				display: block;
				min-height: 2.4rem;
				line-height: 1.2rem;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashEventModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly eventsService = inject(EventsService);
	private readonly router = inject(Router);
	private readonly authService = inject(AuthService);

	@Output() eventCreated = new EventEmitter<Events>();

	submitting = signal(false);
	errorMessage = signal('');

	capacityBlocked = computed(() => {
		const plan = this.authService.currentUser()?.tenant?.plan;
		if (!plan || isEventPlanCode(plan)) return false;
		return !PLAN_FEATURES[plan]?.waitingRoomAndCapacity;
	});

	form = this.fb.group({
		name: this.fb.control('', Validators.required),
		description: this.fb.control(''),
		date: this.fb.control(''),
		time: this.fb.control(''),
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
		const { name, description, date, time, place, capacity } = this.form.getRawValue();

		// El modelo no tiene un campo dedicado a "lugar" — se antepone como primera línea de la
		// descripción (mismo criterio que ya usaba este modal cuando "Lugar" era el único campo de
		// texto libre), y la descripción real (si se cargó) va debajo.
		const descriptionParts = [place?.trim(), description?.trim()].filter((part): part is string => !!part);

		this.eventsService
			.createEvent({
				name: name!.trim(),
				description: descriptionParts.join('\n\n'),
				type: 'Normal',
				// date/time vacíos (caso normal, "ahora mismo") caen al comportamiento de siempre: hoy,
				// sin hora fija. Si se cargó fecha, se manda el string yyyy-MM-dd tal cual (mismo
				// criterio que create-event-modal, ver toDateInputValue ahí) — el input type="date" ya
				// entrega el formato que la API espera, sin reconstruir un Date a mano.
				dateOn: date?.trim() ? date : new Date(),
				startTime: time?.trim() ? time : undefined,
				maxCapacity: capacity ?? null,
			})
			.subscribe({
				next: (event) => {
					this.submitting.set(false);
					this.eventCreated.emit(event);
					this.form.reset({ name: '', description: '', date: '', time: '', place: '', capacity: null });
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
