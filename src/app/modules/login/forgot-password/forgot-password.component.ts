import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { extractErrorMessage } from '../../../utils/api-error';

@Component({
	selector: 'app-forgot-password',
	imports: [RouterLink, ReactiveFormsModule],
	template: `
		<div class="row container-sign-in">
			<div class="col-12">
				<h2>Recuperar contraseña</h2>
			</div>
			<div class="col-12">
				@if (sent()) {
					<p class="form-text">
						Si <strong>{{ formGroupInput.controls.identifier.value }}</strong> corresponde a una cuenta, te mandamos un correo con un link
						para elegir una nueva contraseña. Revisa tu bandeja (y spam) — el link vence en 30 minutos.
					</p>
					<div class="d-grid gap-2">
						<button type="button" class="btn btn-dark" routerLink="/login/sign-in">Volver a iniciar sesión</button>
					</div>
				} @else {
					<form [formGroup]="formGroupInput" (submit)="$event.preventDefault(); forgetPassword()">
						<p class="text-body-secondary small">Ingresa tu usuario o tu correo y te mandamos un link para elegir una nueva contraseña.</p>
						<div class="mb-3">
							<label for="identifier" class="form-label">Usuario o correo electrónico</label>
							<input type="text" id="identifier" class="form-control" formControlName="identifier" required />
						</div>

						@if (status()) {
							<div class="form-text text-danger">{{ status() }}</div>
						}

						<div class="col-12 text-end">
							<span><button type="button" class="btn btn-link" routerLink="/login/sign-in">Volver a iniciar sesión</button></span>
						</div>
						<br />
						<div class="d-grid gap-2">
							<button type="submit" class="btn btn-dark" [disabled]="submitting()">{{ submitting() ? 'Enviando...' : 'Restablecer contraseña' }}</button>
						</div>
					</form>
				}
			</div>
		</div>
	`,
	styleUrl: './forgot-password.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
	private readonly authService = inject(AuthService);
	private readonly fb = inject(FormBuilder);

	formGroupInput = this.fb.group({
		identifier: new FormControl('', { nonNullable: true, validators: Validators.required }),
	});
	submitting = signal(false);
	sent = signal(false);
	status = signal('');

	forgetPassword() {
		if (!this.formGroupInput.valid) {
			this.formGroupInput.markAllAsTouched();
			return;
		}

		this.submitting.set(true);
		this.status.set('');
		this.authService.forgotPassword(this.formGroupInput.getRawValue().identifier).subscribe({
			next: () => {
				this.submitting.set(false);
				this.sent.set(true);
			},
			error: (err: HttpErrorResponse) => {
				this.submitting.set(false);
				this.status.set(extractErrorMessage(err));
			},
		});
	}
}
