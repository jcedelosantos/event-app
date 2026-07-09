import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';

import { AuthService } from '../../../core/services/auth.service';

@Component({
	selector: 'app-sign-in',
	templateUrl: './sign-in.component.html',
	styleUrl: './sign-in.component.css',
	imports: [RouterLink, ReactiveFormsModule],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent {
	private readonly authService = inject(AuthService);
	private readonly router = inject(Router);

	formGroupInput: FormGroup;
	status: string;

	constructor(private fb: FormBuilder) {
		this.formGroupInput = this.fb.group({
			username: new FormControl('', Validators.required),
			password: new FormControl('', Validators.required),
			save: new FormControl(false),
		});
		this.status = '';
	}

	signIn() {
		if (!this.formGroupInput.valid) {
			this.status = 'Please fill in the fields';
			return;
		}

		const { username, password } = this.formGroupInput.value;
		this.authService.login(username, password).subscribe({
			next: () => this.router.navigate(['/manager/dash-board']),
			error: (err: HttpErrorResponse) => {
				this.status = err.status === 401 ? 'username or password incorrect' : 'No se pudo conectar con el servidor';
			},
		});
	}
}
