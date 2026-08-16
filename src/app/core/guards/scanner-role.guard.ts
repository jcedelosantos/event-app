import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

// Un usuario tipo SCANNER (ver User.scannerEventId, middleware/auth.ts blockScannerRole en la API)
// solo puede usar el scanner de QR — se aplica una sola vez, en el route de nivel superior 'manager'
// (ver app.routes.ts), así que cubre CUALQUIER navegación dentro de /manager/** (incluido el
// redirect de login a /manager/dash-board, que nunca necesitó tocarse: este guard lo intercepta
// solo). Mismo patrón async que activeSubscriptionGuard/superAdminGuard — currentUser() se hidrata
// desde /auth/me, leerlo síncrono acá podría rebotar un link directo o un refresh antes de que
// cargue.
const SCANNER_HOME = '/manager/events/qr-scanner';

export const scannerRoleGuard: CanActivateFn = (_route, state) => {
	const authService = inject(AuthService);
	const router = inject(Router);

	return authService.ensureCurrentUser().pipe(
		map((user) => {
			if (user?.type?.type !== 'SCANNER') return true;
			if (state.url.startsWith(SCANNER_HOME)) return true;
			return router.createUrlTree([SCANNER_HOME]);
		}),
	);
};
