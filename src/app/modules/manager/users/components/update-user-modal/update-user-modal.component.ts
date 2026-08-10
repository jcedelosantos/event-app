import { ChangeDetectionStrategy, Component, computed, effect, inject, model, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { User } from '../../../../../models/users/user';
import { UserService, UserTypeCode } from '../../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { confirm } from '../../../../../utils/messages';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
	selector: 'app-update-user-modal',
	imports: [ReactiveFormsModule],
	template: `
		<!-- Modal -->
		<div class="modal fade" id="updateUserModal" tabindex="-1" aria-labelledby="updateUserModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="updateUserModalLabel">{{ user() === null ? 'Create' : 'Update' }} user</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form id="updateUserForm" class="needs-validation" novalidate [formGroup]="form" (ngSubmit)="saveForm()">
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="userName">Username *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('userName')" formControlName="userName" />
									@if (isInvalid('userName')) {
										<div class="invalid-feedback">El username es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="firstName">First name *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
									@if (isInvalid('name')) {
										<div class="invalid-feedback">El nombre es obligatorio.</div>
									}
								</div>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="lastName">Last name *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('lastName')" formControlName="lastName" />
									@if (isInvalid('lastName')) {
										<div class="invalid-feedback">El apellido es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="pasword">Password {{ user() ? '(dejar en blanco para no cambiar)' : '*' }}</label>
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
								<label for="address">Adress</label>
								<input type="text" class="form-control" placeholder="Apartment or suite" formControlName="address" />
							</div>

							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="type">Type *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('userType')" formControlName="userType">
										<option value="">Choose...</option>
										<option value="ROOT">Admin</option>
										<option value="USER">User</option>
										<option value="CLIENT">Client</option>
									</select>
									@if (isInvalid('userType')) {
										<div class="invalid-feedback">Elegí un tipo de usuario.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="state">Gender</label>
									<select class="custom-select d-block w-100" formControlName="gender">
										<option value="">Choose...</option>
										<option value="M">Man</option>
										<option value="F">Woman</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Carnet{{ isChurchTenant() ? ' (opcional)' : ' *' }}</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('carnet')" formControlName="carnet" />
									@if (isInvalid('carnet')) {
										<div class="invalid-feedback">El carnet/cédula es obligatorio.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Phone *</label>
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('phone')" formControlName="phone" />
									@if (isInvalid('phone')) {
										<div class="invalid-feedback">Ingresá un teléfono válido (solo números, espacios, +, -, paréntesis).</div>
									}
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="submit" form="updateUserForm" class="btn btn-primary">
							{{ user() === null ? 'Create' : 'Update' }}
						</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateUserModalComponent {
	userService = inject(UserService);
	private readonly authService = inject(AuthService);

	user = model.required<User | null>();
	userSaved = output<void>();
	errorMessage = '';

	// Solo CLUB depende del carnet para identificar socios al vender un ticket (validateAttendeeRule)
	// — en el resto de los tenants es un dato de referencia, no algo que deba bloquear el alta.
	isChurchTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CHURCH');

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
		carnet: new FormControl<string>('', this.isChurchTenant() ? [] : [Validators.required]),
		address: new FormControl<string>(''),
		phone: new FormControl<string>('', [Validators.required, Validators.pattern('^[- +()0-9]+$')]),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
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
				});
			} else {
				this.form.reset({ userName: '', password: '', userType: '', name: '', lastName: '', gender: '', email: '', carnet: '', address: '', phone: '' });
			}
		});
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
			this.errorMessage = 'La contraseña es requerida para crear un usuario';
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
			userType: value.userType as UserTypeCode,
		};

		confirm(`¿Deseas ${isCreate ? 'crear' : 'actualizar'} el usuario?`, {
			onConfirm: () => (isCreate ? this.createUser(payload) : this.updateUser(this.user()!.id, payload)),
		});
	}

	private createUser(payload: Parameters<UserService['createUser']>[0]) {
		this.userService.createUser(payload).subscribe({
			next: () => this.onSaved(),
			error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
		});
	}

	private updateUser(id: number, payload: Parameters<UserService['updateUser']>[1]) {
		this.userService.updateUser(id, payload).subscribe({
			next: () => this.onSaved(),
			error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
		});
	}

	private onSaved() {
		this.userSaved.emit();
		closeModal('updateUserModal');
	}
}
