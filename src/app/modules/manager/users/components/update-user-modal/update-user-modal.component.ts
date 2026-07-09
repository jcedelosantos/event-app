import { ChangeDetectionStrategy, Component, effect, inject, model, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { User } from '../../../../../models/users/user';
import { UserService, UserTypeCode } from '../../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { confirm } from '../../../../../utils/messages';
import * as bootstrap from 'bootstrap';

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
									<label for="userName">Username</label>
									<input type="text" class="form-control" formControlName="userName" />
								</div>
								<div class="col-md-6 mb-3">
									<label for="firstName">First name</label>
									<input type="text" class="form-control" formControlName="name" />
								</div>
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="lastName">Last name</label>
									<input type="text" class="form-control" formControlName="lastName" />
								</div>
								<div class="col-md-6 mb-3">
									<label for="pasword">Password {{ user() ? '(dejar en blanco para no cambiar)' : '' }}</label>
									<input type="password" class="form-control" formControlName="password" />
								</div>
							</div>

							<div class="mb-3">
								<label for="email">Email</label>
								<input type="email" class="form-control" id="email" placeholder="you@example.com" formControlName="email" />
							</div>

							<div class="mb-3">
								<label for="address">Adress</label>
								<input type="text" class="form-control" placeholder="Apartment or suite" formControlName="address" />
							</div>

							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="type">Type</label>
									<select class="custom-select d-block w-100" formControlName="userType" required>
										<option value="">Choose...</option>
										<option value="ROOT">Admin</option>
										<option value="USER">User</option>
										<option value="CLIENT">Client</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label for="state">Gender</label>
									<select class="custom-select d-block w-100" formControlName="gender" required>
										<option value="">Choose...</option>
										<option value="M">Man</option>
										<option value="F">Woman</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Carnet</label>
									<input type="text" class="form-control" formControlName="carnet" />
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Phone</label>
									<input type="text" class="form-control" formControlName="phone" />
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="submit" form="updateUserForm" class="btn btn-primary" [disabled]="form.invalid">
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

	user = model.required<User | null>();
	userSaved = output<void>();
	errorMessage = '';

	form = new FormGroup({
		userName: new FormControl<string>('', [Validators.required]),
		password: new FormControl<string>(''),
		userType: new FormControl<UserTypeCode | ''>('', Validators.required),
		name: new FormControl<string>('', Validators.required),
		lastName: new FormControl<string>('', Validators.required),
		gender: new FormControl<string>('', Validators.required),
		email: new FormControl<string>('', [Validators.required, Validators.email]),
		carnet: new FormControl<number | null>(null, Validators.required),
		address: new FormControl<string>('', Validators.required),
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
				this.form.reset({ userName: '', password: '', userType: '', name: '', lastName: '', gender: '', email: '', carnet: null, address: '', phone: '' });
			}
		});
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
			error: (err: HttpErrorResponse) => (this.errorMessage = err.error?.error ?? err.message),
		});
	}

	private updateUser(id: number, payload: Parameters<UserService['updateUser']>[1]) {
		this.userService.updateUser(id, payload).subscribe({
			next: () => this.onSaved(),
			error: (err: HttpErrorResponse) => (this.errorMessage = err.error?.error ?? err.message),
		});
	}

	private onSaved() {
		this.userSaved.emit();
		const modalEl = document.getElementById('updateUserModal');
		if (modalEl) {
			bootstrap.Modal.getOrCreateInstance(modalEl).hide();
		}
	}
}
