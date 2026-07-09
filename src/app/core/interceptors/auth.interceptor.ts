import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
	if (!req.url.startsWith(environment.apiUrl)) {
		return next(req);
	}

	const authService = inject(AuthService);
	const router = inject(Router);
	const token = authService.getToken();
	const authedReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

	return next(authedReq).pipe(
		catchError((err) => {
			const isLoginRequest = req.url.endsWith('/auth/login');
			if (err.status === 401 && !isLoginRequest) {
				authService.logout();
				router.navigate(['/login/sign-in']);
			}
			return throwError(() => err);
		}),
	);
};
