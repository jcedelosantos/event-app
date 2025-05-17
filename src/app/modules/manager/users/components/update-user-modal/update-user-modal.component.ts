import { ChangeDetectionStrategy, Component, effect, inject, model } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { User } from '../../../../../models/users/user';
import { UserType } from '../../../../../models/users/user-type';
import { UserService } from '../../services/user.service';
import { HttpErrorResponse } from '@angular/common/http';
import { confirm } from "../../../../../utils/messages";


@Component({
	selector: 'app-update-user-modal',
	imports: [ReactiveFormsModule],
	template: `
		<!-- Modal -->
		<div class="modal fade" id="updateUserModal" tabindex="-1" aria-labelledby="updateUserModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="updateUserModalLabel">{{user() === null ? 'Create' : "Update"}} user</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form class="needs-validation" novalidate="" [formGroup]="form" (ngSubmit)="setForm()">
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="firstName">First name</label>
									<input type="text" class="form-control" formControlName="name" />
									<!-- <div class="invalid-feedback">Valid first name is required.</div> -->
								</div>
								<div class="col-md-6 mb-3">
									<label for="lastName">Last name</label>
									<input type="text" class="form-control" formControlName="lastName" />
									<div class="invalid-feedback">Valid last name is required.</div>
								</div>
							</div>

							<div class="mb-3">
								<label for="pasword">Password</label>
								<input type="password" class="form-control" formControlName="password" />
								<!-- <div class="invalid-feedback">Please enter your shipping address.</div> -->
							</div>

							<div class="mb-3">
								<label for="pasword2">Password <span class="text-muted">(Confirm)</span></label>
								<input type="password" class="form-control" />
							</div>

							<div class="mb-3">
								<label for="email">Email <span class="text-muted">(Optional)</span></label>
								<input type="email" class="form-control" id="email" placeholder="you@example.com" formControlName="email" />
								<div class="invalid-feedback">Please enter a valid email address for shipping updates.</div>
							</div>

							<div class="mb-3">
								<label for="address">Adress <span class="text-muted">(Optional)</span></label>
								<input type="text" class="form-control" placeholder="Apartment or suite" formControlName="address" />
							</div>

							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="type">Type</label>
									<select class="custom-select d-block w-100" required="">
										<option value="">Choose...</option>
										<option>Admin</option>
										<option>User</option>
										<option>Client</option>
									</select>
									<!-- <div class="invalid-feedback">Please select a valid country.</div> -->
								</div>
								<div class="col-md-6 mb-3">
									<label for="state">Gender</label>
									<select class="custom-select d-block w-100" id="state" required="">
										<option value="">Choose...</option>
										<option>Man</option>
										<option>Woman</option>
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Carnet</label>
									<input type="text" class="form-control" formControlName="carnet" />
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Phone <span class="text-muted">(Optional)</span></label>
									<input type="text" class="form-control"  formControlName="phone" />
								</div>
							</div>
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="submit" class="btn btn-primary" [disabled]="form.invalid">Update</button>
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

	form = new FormGroup({
		id: new FormControl<number>(0, [Validators.required]),
		userName: new FormControl<string>('', [Validators.required]),
		password: new FormControl<string>('', [Validators.required]),
		type: new FormControl<UserType | null>(null, Validators.required),
		name: new FormControl<string | null>(null, Validators.required),
		lastName: new FormControl<string | null>(null, Validators.required),
		gender: new FormControl<string | null>(null, Validators.required),
		email: new FormControl<string | null>(null, [Validators.required, Validators.email]),
		carnet: new FormControl<number | null>(null, Validators.required),
		address: new FormControl<string | null>(null, Validators.required),
		phone: new FormControl<string | number | null>(null, [Validators.required, Validators.pattern('^[- +()0-9]+$')]),
	});

	constructor() {
		effect(() => {
			if (this.user()) {
				this.setForm();
			}
		})
	}

	setForm() {
		if (this.user()) {
			this.form.patchValue({
				id: this.user()?.id,
				userName: this.user()?.username,
				password: this.user()?.password,
				type: this.user()?.type,
				name: this.user()?.name,
				lastName: this.user()?.lastname,
				gender: this.user()?.gender,
				email: this.user()?.email,
				carnet: this.user()?.carnet,
				address: this.user()?.adress,
				phone: this.user()?.phone,
			});
		}
	}

	saveForm() {
		const userId = this.user()?.id ?? 0;
		confirm(`Do you wish to ` + (userId > 0 ? 'create' : 'update') + ' user?', {
			onConfirm: () => {
				if (userId > 0) {
					this.updateUser(this.form.getRawValue() as unknown as User)
				} else {
					this.createUser(this.form.getRawValue() as unknown as User)
				}
			}
		})
	}

	private updateUser(user: User) {
		this.userService.updateUser(user).subscribe({
			next: (user) => {
				console.log(user);
			},
			error: (err: HttpErrorResponse) => {
				console.error(err.error.message ?? err.message);

			}
		})
	}

	private createUser(user: User) {
		this.userService.createUser(user).subscribe({
			next: (user) => {
				console.log(user);
			},
			error: (err: HttpErrorResponse) => {
				console.error(err.error.message ?? err.message);

			}
		})
	}
}