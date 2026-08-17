import { ChangeDetectionStrategy, Component, effect, inject, model, OnInit, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { User } from '../../../../../models/users/user';
import { UserService, UserTypeCode } from '../../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { confirm } from '../../../../../utils/messages';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { EventsService } from '../../../events/services/events.service';
import { Events } from '../../../../../models/events/events';
import { AccessPointsService } from '../../../access-points/services/access-points.service';
import { AccessPoint } from '../../../../../models/access-points/access-point';

@Component({
	selector: 'app-update-user-modal',
	imports: [ReactiveFormsModule],
	template: `
		<!-- Modal -->
		<div class="modal fade" id="updateUserModal" tabindex="-1" aria-labelledby="updateUserModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="updateUserModalLabel">{{ user() === null ? 'Crear' : 'Editar' }} usuario</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
					</div>
					<div class="modal-body">
						<form id="updateUserForm" class="needs-validation" novalidate [formGroup]="form" (ngSubmit)="saveForm()">
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="userName">Usuario *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('userName')" formControlName="userName" />
									@if (isInvalid('userName')) {
										<div class="invalid-feedback">El username es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="firstName">Nombre *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
									@if (isInvalid('name')) {
										<div class="invalid-feedback">El nombre es obligatorio.</div>
									}
								</div>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="lastName">Apellido *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('lastName')" formControlName="lastName" />
									@if (isInvalid('lastName')) {
										<div class="invalid-feedback">El apellido es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="pasword">Contraseña {{ user() ? '(dejar en blanco para no cambiar)' : '*' }}</label>
									<input type="password" class="form-control" formControlName="password" />
								</div>
							</div>

							<div class="mb-3">
								<label for="email">Email *</label>
								<input type="email" class="form-control" [class.is-invalid]="isInvalid('email')" id="email" placeholder="you@example.com" formControlName="email" />
								@if (isInvalid('email')) {
									<div class="invalid-feedback">Ingresá un email válido.</div>
								}
							</div>

							<div class="mb-3">
								<label for="address">Dirección</label>
								<input type="text" class="form-control" placeholder="Apartment or suite" formControlName="address" />
							</div>

							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="type">Tipo *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('userType')" formControlName="userType">
										<option value="">Elegir...</option>
										<option value="ROOT">Admin</option>
										<option value="USER">Usuario</option>
										<option value="CLIENT">Cliente</option>
										<option value="SCANNER">Escáner</option>
									</select>
									@if (isInvalid('userType')) {
										<div class="invalid-feedback">Elige un tipo de usuario.</div>
									}
								</div>
								@if (form.controls.userType.value === 'SCANNER') {
									<div class="col-md-6 mb-3">
										<label for="scannerEventId">Evento asignado *</label>
										<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('scannerEventId')" formControlName="scannerEventId">
											<option [ngValue]="null">Elige un evento...</option>
											@for (event of events(); track event.id) {
												<option [ngValue]="event.id">{{ event.name }}</option>
											}
										</select>
										@if (isInvalid('scannerEventId')) {
											<div class="invalid-feedback">Un usuario Escáner necesita un evento asignado.</div>
										}
									</div>
									@if (form.controls.scannerEventId.value) {
										<div class="col-md-6 mb-3">
											<label for="accessPointId">Puerta asignada (opcional)</label>
											<select class="custom-select d-block w-100" formControlName="accessPointId">
												<option [ngValue]="null">Cualquier puerta del evento</option>
												@for (gate of accessPoints(); track gate.id) {
													<option [ngValue]="gate.id">{{ gate.name }}</option>
												}
											</select>
											<div class="form-text">Si elegís una puerta, este usuario queda fijo a escanear solo por ahí (kiosco fijo).</div>
										</div>
									}
								}
								<div class="col-md-6 mb-3">
									<label for="state">Género</label>
									<select class="custom-select d-block w-100" formControlName="gender">
										<option value="">Elegir...</option>
										<option value="M">Hombre</option>
										<option value="F">Mujer</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Carnet{{ userTypeValue() === 'CLIENT' ? ' *' : ' (opcional)' }}</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('carnet')" formControlName="carnet" />
									@if (isInvalid('carnet')) {
										<div class="invalid-feedback">El carnet/cédula es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Teléfono *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('phone')" formControlName="phone" />
									@if (isInvalid('phone')) {
										<div class="invalid-feedback">Ingresá un teléfono válido (solo números, espacios, +, -, paréntesis).</div>
									}
								</div>
							</div>
							@if (errorMessage()) {
								<div class="text-danger">{{ errorMessage() }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
						<button type="submit" form="updateUserForm" class="btn btn-primary">
							{{ user() === null ? 'Crear' : 'Guardar' }}
						</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateUserModalComponent implements OnInit {
	userService = inject(UserService);
	private readonly eventsService = inject(EventsService);
	private readonly accessPointsService = inject(AccessPointsService);

	user = model.required<User | null>();
	userSaved = output<void>();
	// Signal (no campo plano): el componente es OnPush y esto se asigna desde un callback de HTTP —
	// un campo plano mutado ahí no repinta la vista sola (mismo motivo documentado en
	// create-qr-modal.component.ts).
	errorMessage = signal('');

	// Para el selector "Evento asignado" que solo aparece cuando userType === 'SCANNER' (ver
	// User.scannerEventId en la API).
	events = signal<Events[]>([]);

	// Puertas del evento elegido, para el selector opcional "Puerta asignada" (ver
	// User.accessPointId en la API) — se recarga cada vez que scannerEventId cambia.
	accessPoints = signal<AccessPoint[]>([]);

	// Espejo de userType para el template (un FormControl no se puede leer directo ahí porque OnPush
	// no repinta solo con sus cambios) — decide si el carnet es obligatorio (solo Cliente).
	userTypeValue = signal<UserTypeCode | ''>('');

	form = new FormGroup({
		userName: new FormControl<string>('', [Validators.required]),
		password: new FormControl<string>(''),
		userType: new FormControl<UserTypeCode | ''>('', Validators.required),
		name: new FormControl<string>('', Validators.required),
		lastName: new FormControl<string>('', Validators.required),
		// Sin Validators.required: los socios dados de alta por vía rápida (venta de ticket, import
		// CSV, o los datos de prueba ya cargados en producción) suelen tener estos dos vacíos — antes
		// eso bloqueaba en silencio CUALQUIER edición del usuario (ni el email se podía cambiar) sin
		// mostrar ningún error, porque el form ya nacía inválido y saveForm() cortaba antes de llamar
		// al backend.
		gender: new FormControl<string>(''),
		email: new FormControl<string>('', [Validators.required, Validators.email]),
		carnet: new FormControl<string>(''),
		address: new FormControl<string>(''),
		phone: new FormControl<string>('', [Validators.required, Validators.pattern('^[- +()0-9]+$')]),
		scannerEventId: new FormControl<number | null>(null),
		accessPointId: new FormControl<number | null>(null),
	});

	constructor() {
		effect(() => {
			this.errorMessage.set('');
			const current = this.user();
			if (current) {
				this.form.patchValue({
					userName: current.username,
					password: '',
					userType: current.type?.type as UserTypeCode,
					name: current.name,
					lastName: current.lastname,
					gender: current.gender,
					email: current.email,
					carnet: current.carnet,
					address: current.adress,
					phone: String(current.phone),
					scannerEventId: current.scannerEventId ?? null,
					// Después de scannerEventId a propósito: patchValue aplica las claves en orden, y
					// el cambio de scannerEventId de arriba dispara la suscripción de abajo, que
					// resetea accessPointId a null — esta clave posterior pisa ese reset con el valor
					// real que trae el usuario.
					accessPointId: current.accessPointId ?? null,
				});
			} else {
				this.form.reset({ userName: '', password: '', userType: '', name: '', lastName: '', gender: '', email: '', carnet: '', address: '', phone: '', scannerEventId: null, accessPointId: null });
			}
		});

		// scannerEventId solo es obligatorio mientras userType sea 'SCANNER', y carnet solo mientras
		// sea 'CLIENT' — se recalculan cada vez que el tipo cambia (ej. el usuario prueba "Escáner",
		// se arrepiente y elige "User" antes de guardar).
		this.form.controls.userType.valueChanges.subscribe((type) => {
			this.userTypeValue.set(type ?? '');

			const scannerControl = this.form.controls.scannerEventId;
			scannerControl.setValidators(type === 'SCANNER' ? [Validators.required] : []);
			scannerControl.updateValueAndValidity({ emitEvent: false });

			const carnetControl = this.form.controls.carnet;
			carnetControl.setValidators(type === 'CLIENT' ? [Validators.required] : []);
			carnetControl.updateValueAndValidity({ emitEvent: false });
		});

		// accessPointId es opcional incluso para SCANNER (fija a una sola puerta, ver
		// User.accessPointId) — cada vez que cambia el evento asignado se recargan sus puertas y se
		// limpia la selección anterior (pertenecía a otro evento). El patch de arriba pisa este reset
		// cuando corresponde conservar la puerta ya guardada (ver comentario en el patchValue).
		this.form.controls.scannerEventId.valueChanges.subscribe((eventId) => {
			this.form.controls.accessPointId.setValue(null, { emitEvent: false });
			this.accessPoints.set([]);
			if (eventId) {
				this.accessPointsService.getByEvent(eventId).subscribe((gates) => this.accessPoints.set(gates));
			}
		});
	}

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	saveForm() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		const isCreate = this.user() === null;

		if (isCreate && !value.password) {
			this.errorMessage.set('La contraseña es requerida para crear un usuario');
			return;
		}

		const payload = {
			username: value.userName!,
			...(value.password ? { password: value.password } : {}),
			name: value.name!,
			lastname: value.lastName!,
			gender: value.gender!,
			email: value.email!,
			carnet: value.carnet!,
			adress: value.address!,
			phone: value.phone!,
			scannerEventId: value.scannerEventId,
			accessPointId: value.accessPointId,
			userType: value.userType as UserTypeCode,
		};

		confirm(`¿Deseas ${isCreate ? 'crear' : 'actualizar'} el usuario?`, {
			onConfirm: () => (isCreate ? this.createUser(payload) : this.updateUser(this.user()!.id, payload)),
		});
	}

	private createUser(payload: Parameters<UserService['createUser']>[0]) {
		this.userService.createUser(payload).subscribe({
			next: () => this.onSaved(),
			error: (err: HttpErrorResponse) => this.errorMessage.set(extractErrorMessage(err)),
		});
	}

	private updateUser(id: number, payload: Parameters<UserService['updateUser']>[1]) {
		this.userService.updateUser(id, payload).subscribe({
			next: () => this.onSaved(),
			error: (err: HttpErrorResponse) => this.errorMessage.set(extractErrorMessage(err)),
		});
	}

	private onSaved() {
		this.userSaved.emit();
		closeModal('updateUserModal');
	}
}
