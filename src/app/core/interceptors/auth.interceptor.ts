import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';
import { Toast } from '../../utils/messages';

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
				// Antes este redirect era silencioso — al usuario le parecía que "la app se cerró" de la
				// nada, en vez de entender que tenía que volver a loguearse (reportado en vivo: perdió el
				// formulario de edición de evento a mitad de guardar, dos veces seguidas, sin ningún aviso).
				Toast.fire({ icon: 'warning', title: 'Tu sesión expiró — iniciá sesión de nuevo.' });
				authService.logout();
				router.navigate(['/login/sign-in']);
			}
			return throwError(() => err);
		}),
	);
};
