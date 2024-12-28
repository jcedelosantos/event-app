import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
	selector: 'app-forgot-password',
	imports: [RouterLink, ReactiveFormsModule],
	template: `
		<div class="row container-sign-in">
			<div class="col-12">
				<h2>Forgot password</h2>
			</div>
			<div class="col-12">
				<form [formGroup]="formGroupInput">
					<div class="mb-3">
						<label for="email" class="form-label">Email</label>
						<input type="email" id="email" class="form-control" formControlName="email" required />
					</div>

					@if (status) {
						<div class="form-text">{{ status }}</div>
					}

					<div class="col-12 text-end">
						<span> <button type="button" class="btn btn-link" routerLink="/login/sign-up">Sign In</button></span>
					</div>
					<br />
					<div class="d-grid gap-2">
						<button type="button" class="btn btn-dark" (click)="forgetPassword()">Reset password</button>
					</div>
				</form>
			</div>
		</div>
	`,
	styleUrl: './forgot-password.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
	formGroupInput: FormGroup;
	status: string;

	constructor(
		private fb: FormBuilder,
		private router: Router,
	) {
		this.formGroupInput = this.fb.group({
			email: new FormControl('', Validators.required),
		});
		this.status = '';
	}
	forgetPassword() {
		if (this.formGroupInput.valid) {
			this['router'].navigate(['/login/sign-in']);
		}
		this.status = 'forgetPassword ... ';
	}
}
