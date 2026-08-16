import { UserType } from './user-type';
import { TenantType } from '../tenants/tenant';
import { PlanCode } from '../../shared/pricing-plans';
import { EventPlanCode } from '../../shared/event-plans';

export interface User {
	id: number;
	username: string;
	// La API nunca devuelve el hash; solo se envía al crear/actualizar.
	password?: string;
	type: UserType;
	name: string;
	lastname: string;
	gender: string;
	email: string;
	carnet: string;
	adress: string;
	phone: string | number;
	// Solo tiene valor real cuando type.type === 'SCANNER' — el evento al que este usuario queda
	// restringido a escanear (ver User.scannerEventId en la API, middleware/auth.ts blockScannerRole).
	scannerEventId?: number | null;
	// null solo para la cuenta de Super Admin — no pertenece a ninguna organización, y también para
	// tenants dados de alta antes de que existiera el sistema de suscripciones (ver getTenantPlanFeatures
	// en el backend: plan null = sin restricción).
	tenant?: {
		id: number;
		name: string;
		type: TenantType;
		slug: string;
		logoUrl?: string | null;
		// EventPlanCode = tenant "evento único, sin suscripción" (ver shared/event-plans.ts) — paga
		// una vez, sin fila de Subscription.
		plan: PlanCode | EventPlanCode | null;
		// EVENT_ENDED es propio de un tenant de evento único: su evento ya pasó, quedó en modo de
		// solo consulta (ver active-subscription.guard.ts). PENDING_REVIEW es propio de un tenant de
		// evento único que pagó por transferencia: subió el comprobante, espera revisión manual del
		// Super Admin (ver routes/signup-event.ts). ARCHIVED es un paso más allá de EVENT_ENDED (30
		// días sin reactivar, ver lib/event-plan-expiry.ts en la API) — bloquea también el login, así
		// que en la práctica nunca debería llegar a poblar un currentUser() ya logueado.
		planStatus: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EVENT_ENDED' | 'PENDING_REVIEW' | 'ARCHIVED' | null;
	} | null;
}
