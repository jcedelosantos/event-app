import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Mismo criterio que activeSubscriptionGuard: currentUser() se hidrata async desde /auth/me, así
// que leerlo de forma síncrona acá corría el riesgo de rebotar a /manager en un link directo o un
// refresh (currentUser() todavía null en ese primer chequeo, aunque el token sí sea de Super Admin).
export const superAdminGuard: CanActivateFn = () => {
	const authService = inject(AuthService);
	const router = inject(Router);

	if (!authService.isAuthenticated()) {
		return router.createUrlTree(['/login/sign-in']);
	}

	return authService.ensureCurrentUser().pipe(
		map((user) => {
			if (user?.tenant === null) return true;
			return router.createUrlTree(['/manager']);
		}),
	);
};
