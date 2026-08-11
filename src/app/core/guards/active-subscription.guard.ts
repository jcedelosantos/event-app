import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Bloquea el acceso al manager cuando la suscripción del tenant no está ACTIVE — mismo criterio que
// requireActiveSubscription del backend (api/src/middleware/plan.ts), acá aplicado ANTES de que la
// pantalla llegue a pedir nada al servidor. tenant.plan null = organización sin suscripción propia,
// nunca se restringe (mismo comentario que getTenantPlanFeatures).
export const activeSubscriptionGuard: CanActivateFn = () => {
	const authService = inject(AuthService);
	const router = inject(Router);

	return authService.ensureCurrentUser().pipe(
		map((user) => {
			const tenant = user?.tenant;
			// EVENT_ENDED (ver lib/event-plans.ts en el backend) = tenant de evento único cuyo evento
			// ya pasó — modo de solo consulta: navega igual que uno ACTIVE, cualquier escritura la
			// bloquea el 402 de requireActiveSubscription en el backend (ver Toast en cada acción).
			if (!tenant?.plan || tenant.planStatus === 'ACTIVE' || tenant.planStatus === 'EVENT_ENDED') {
				return true;
			}
			return router.createUrlTree(['/manager/suscripcion']);
		}),
	);
};
