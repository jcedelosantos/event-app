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
		// solo consulta (ver active-subscription.guard.ts).
		planStatus: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EVENT_ENDED' | null;
	} | null;
}
