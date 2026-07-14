import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { extractErrorMessage } from '../../utils/api-error';
import { closeModal } from '../../utils/modal';

// Autogestión de la cuenta propia (username/contraseña) — se monta una sola vez y siempre lee
// authService.currentUser(), así que sirve igual para un manager de un tenant o para el Super
// Admin sin necesitar dos componentes distintos.
@Component({
	selector: 'app-account-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="accountModal" tabindex="-1" aria-labelledby="accountModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="accountModalLabel">Mi cuenta</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form id="accountForm" (submit)="$event.preventDefault(); saveForm()" [formGroup]="form">
							<div class="mb-3">
								<label for="accUsername">Username *</label>
								<input type="text" class="form-control" id="accUsername" [class.is-invalid]="isInvalid('username')" formControlName="username" />
								@if (isInvalid('username')) {
									<div class="invalid-feedback">El username es obligatorio.</div>
								}
							</div>
							<hr />
							<p class="text-muted small mb-2">Cambiar contraseña (dejar en blanco para no cambiarla)</p>
							<div class="mb-3">
								<label for="accCurrentPassword">Contraseña actual</label>
								<input type="password" class="form-control" id="accCurrentPassword" formControlName="currentPassword" />
							</div>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="accNewPassword">Contraseña nueva</label>
									<input type="password" class="form-control" id="accNewPassword" formControlName="newPassword" />
								</div>
								<div class="col-md-6 mb-3">
									<label for="accConfirmPassword">Confirmar contraseña</label>
									<input type="password" class="form-control" [class.is-invalid]="isInvalid('confirmPassword')" id="accConfirmPassword" formControlName="confirmPassword" />
									@if (isInvalid('confirmPassword')) {
										<div class="invalid-feedback">Las contraseñas no coinciden.</div>
									}
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
						<button type="submit" form="accountForm" class="btn btn-primary">Guardar</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountModalComponent {
	private readonly authService = inject(AuthService);
	errorMessage = '';

	form = new FormGroup({
		username: new FormControl<string>('', Validators.required),
		currentPassword: new FormControl<string>(''),
		newPassword: new FormControl<string>(''),
		confirmPassword: new FormControl<string>(''),
	});

	constructor() {
		effect(() => {
			const user = this.authService.currentUser();
			this.errorMessage = '';
			this.form.reset({ username: user?.username ?? '', currentPassword: '', newPassword: '', confirmPassword: '' });
		});
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		if (controlName === 'confirmPassword') {
			const value = this.form.getRawValue();
			return !!value.newPassword && value.newPassword !== value.confirmPassword && control.touched;
		}
		return control.invalid && control.touched;
	}

	saveForm() {
		this.errorMessage = '';
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		if (value.newPassword && value.newPassword !== value.confirmPassword) {
			this.form.controls.confirmPassword.markAsTouched();
			this.errorMessage = 'Las contraseñas no coinciden.';
			return;
		}
		if (value.newPassword && !value.currentPassword) {
			this.errorMessage = 'Ingresá tu contraseña actual para poder cambiarla.';
			return;
		}

		this.authService
			.updateMe({
				username: value.username || undefined,
				currentPassword: value.currentPassword || undefined,
				newPassword: value.newPassword || undefined,
			})
			.subscribe({
				next: () => closeModal('accountModal'),
				error: (err: HttpErrorResponse) => (this.errorMessage = extractErrorMessage(err)),
			});
	}
}
