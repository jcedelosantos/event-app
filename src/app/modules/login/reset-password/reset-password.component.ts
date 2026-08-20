import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { extractErrorMessage } from '../../../utils/api-error';

@Component({
	selector: 'app-reset-password',
	imports: [RouterLink, ReactiveFormsModule],
	template: `
		<div class="row container-sign-in">
			<div class="col-12">
				<h2>Elegir nueva contraseña</h2>
			</div>
			<div class="col-12">
				@if (!token()) {
					<p class="form-text text-danger">Este link no es válido — falta el token. Pedí uno nuevo.</p>
					<div class="d-grid gap-2">
						<button type="button" class="btn btn-dark" routerLink="/login/forgot-password">Pedir un link nuevo</button>
					</div>
				} @else if (done()) {
					<p class="form-text">Listo, tu contraseña quedó actualizada.</p>
					<div class="d-grid gap-2">
						<button type="button" class="btn btn-dark" routerLink="/login/sign-in">Iniciar sesión</button>
					</div>
				} @else {
					<form [formGroup]="formGroupInput" (submit)="$event.preventDefault(); submit()">
						<div class="mb-3">
							<label for="newPassword" class="form-label">Nueva contraseña</label>
							<input type="password" id="newPassword" class="form-control" formControlName="newPassword" required />
							@if (isInvalid('newPassword')) {
								<div class="invalid-feedback d-block">Mínimo 4 caracteres.</div>
							}
						</div>
						<div class="mb-3">
							<label for="confirmPassword" class="form-label">Confirmar contraseña</label>
							<input type="password" id="confirmPassword" class="form-control" formControlName="confirmPassword" required />
							@if (formGroupInput.controls.confirmPassword.touched && passwordsMismatch()) {
								<div class="invalid-feedback d-block">Las contraseñas no coinciden.</div>
							}
						</div>

						@if (status()) {
							<div class="form-text text-danger">{{ status() }}</div>
						}

						<div class="d-grid gap-2">
							<button type="submit" class="btn btn-dark" [disabled]="submitting()">{{ submitting() ? 'Guardando...' : 'Guardar nueva contraseña' }}</button>
						</div>
					</form>
				}
			</div>
		</div>
	`,
	styleUrl: './reset-password.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly authService = inject(AuthService);
	private readonly fb = inject(FormBuilder);

	token = signal<string | null>(null);
	submitting = signal(false);
	done = signal(false);
	status = signal('');

	formGroupInput = this.fb.group({
		newPassword: this.fb.control('', [Validators.required, Validators.minLength(4)]),
		confirmPassword: this.fb.control('', Validators.required),
	});

	ngOnInit(): void {
		this.token.set(this.route.snapshot.queryParamMap.get('token'));
	}

	isInvalid(controlName: keyof typeof this.formGroupInput.controls): boolean {
		const control = this.formGroupInput.controls[controlName];
		return control.invalid && control.touched;
	}

	passwordsMismatch(): boolean {
		const { newPassword, confirmPassword } = this.formGroupInput.value;
		return !!confirmPassword && newPassword !== confirmPassword;
	}

	submit() {
		const token = this.token();
		if (!token || !this.formGroupInput.valid || this.passwordsMismatch()) {
			this.formGroupInput.markAllAsTouched();
			return;
		}

		this.submitting.set(true);
		this.status.set('');
		this.authService.resetPassword(token, this.formGroupInput.value.newPassword!).subscribe({
			next: () => {
				this.submitting.set(false);
				this.done.set(true);
			},
			error: (err: HttpErrorResponse) => {
				this.submitting.set(false);
				this.status.set(extractErrorMessage(err));
			},
		});
	}
}
