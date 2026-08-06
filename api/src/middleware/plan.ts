import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from './auth';
import { PLANS, PlanCode, isPlanCode } from '../lib/plans';

type PlanFeature = keyof (typeof PLANS)['BASICO']['features'];

// Tenant.plan null = organización sin suscripción propia (dada de alta a mano por Super Admin
// antes de que existiera este sistema, o el tenant seed de desarrollo) — se trata como "sin
// restricción" para no romper retroactivamente cuentas existentes (ver comentario en schema.prisma).
export async function getTenantPlanFeatures(tenantId: number): Promise<{ blocked: false; features: null } | { blocked: true; reason: string } | { blocked: false; features: (typeof PLANS)['BASICO']['features'] }> {
	const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, planStatus: true } });
	if (!tenant?.plan) {
		return { blocked: false, features: null };
	}
	if (tenant.planStatus !== 'ACTIVE') {
		return { blocked: true, reason: 'Tu suscripción no está activa — contactanos para regularizarla.' };
	}
	if (!isPlanCode(tenant.plan)) {
		return { blocked: false, features: null };
	}
	return { blocked: false, features: PLANS[tenant.plan].features };
}

// Gatea una feature premium (portal público, reportería avanzada, pagos online, sala de espera +
// aforo/invitados) detrás del plan del tenant autenticado — no aplica a rutas públicas sin sesión
// (ver getTenantPlanFeatures, se usa ahí directo sin este wrapper de Express).
export function requirePlan(feature: PlanFeature) {
	return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
		const tenantId = req.user?.tenantId;
		if (tenantId == null) {
			// Super Admin no pertenece a ningún tenant — nunca lo bloquea el plan de otro.
			next();
			return;
		}
		const result = await getTenantPlanFeatures(tenantId);
		if (result.blocked) {
			res.status(402).json({ error: result.reason });
			return;
		}
		if (result.features && !result.features[feature]) {
			res.status(403).json({ error: 'Esta función no está incluida en tu plan actual.' });
			return;
		}
		next();
	};
}

// Bloquea toda ESCRITURA (no GET) cuando la suscripción del tenant no está ACTIVE — a diferencia de
// requirePlan (que gatea UNA feature premium puntual), esto es un bloqueo total de la operativa
// normal: "cuenta con el pago pendiente = solo lectura", sin importar el plan contratado.
export async function requireActiveSubscription(req: AuthenticatedRequest, res: Response, next: NextFunction) {
	if (req.method === 'GET') {
		next();
		return;
	}
	const tenantId = req.user?.tenantId;
	if (tenantId == null) {
		// Super Admin no pertenece a ningún tenant — nunca lo bloquea el plan de otro.
		next();
		return;
	}
	const result = await getTenantPlanFeatures(tenantId);
	if (result.blocked) {
		res.status(402).json({ error: result.reason });
		return;
	}
	next();
}

export type { PlanCode, PlanFeature };
