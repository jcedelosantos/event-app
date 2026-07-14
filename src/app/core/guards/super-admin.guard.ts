import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const superAdminGuard: CanActivateFn = () => {
	const authService = inject(AuthService);
	const router = inject(Router);

	if (!authService.isAuthenticated()) {
		return router.createUrlTree(['/login/sign-in']);
	}

	if (authService.currentUser()?.tenant === null) {
		return true;
	}

	return router.createUrlTree(['/manager']);
};
