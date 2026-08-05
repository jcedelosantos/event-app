// Cobro RECURRENTE de la mensualidad que un tenant le paga a la agencia (PayPal Subscriptions,
// `/v1/billing/*`) — no confundir con lib/paypal.ts, que cobra UN ticket de UNA vez a la cuenta
// PayPal *del comprador de un tenant* (Orders v2, `/v2/checkout/orders*`).
//
// Las credenciales viven en `PlatformSetting` (ver schema.prisma) — su propio lugar, genuinamente
// global, sin tenantId — NO un lookup a ningún Tenant en particular. Se puebla una sola vez con
// `npm run copy:paypal-platform` (ver prisma/copy-club-paypal-to-platform.ts), que copia las
// credenciales de prueba ya cargadas en el tenant del club al momento de correrlo — de ahí en más
// esta tabla vive independiente de ese tenant (si el club cambia su propio PayPal de tickets
// después, esto no se entera ni se rompe).
import { prisma } from './prisma';
import { PayPalConfig } from './paypal';

export class PayPalBillingNotConfiguredError extends Error {}
export class PayPalBillingRequestError extends Error {}

const API_BASE: Record<PayPalConfig['mode'], string> = {
	sandbox: 'https://api-m.sandbox.paypal.com',
	live: 'https://api-m.paypal.com',
};

export type PlanCode = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'PRO_MAX';

const PLAN_ID_ENV_KEY: Record<PlanCode, string> = {
	BASICO: 'PAYPAL_PLAN_ID_BASICO',
	INTERMEDIO: 'PAYPAL_PLAN_ID_INTERMEDIO',
	AVANZADO: 'PAYPAL_PLAN_ID_AVANZADO',
	PRO_MAX: 'PAYPAL_PLAN_ID_PRO_MAX',
};

const PLATFORM_KEYS = ['paypalClientId', 'paypalSecret', 'paypalMode'] as const;

async function getPlatformConfig(): Promise<PayPalConfig> {
	const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...PLATFORM_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const clientId = map['paypalClientId'];
	const secret = map['paypalSecret'];
	if (!clientId || !secret) {
		throw new PayPalBillingNotConfiguredError('El PayPal de plataforma todavía no está configurado — correr `npm run copy:paypal-platform`.');
	}
	return {
		clientId,
		secret,
		mode: map['paypalMode'] === 'live' ? 'live' : 'sandbox',
		// El webhook de suscripción es un recurso propio (ver comentario de arriba) — se define por
		// env var, no vive en PlatformSetting, porque no hay nada que "copiar" desde el club: hay que
		// crearlo a mano una vez en el panel de PayPal apuntando a /public/webhooks/paypal-billing.
		webhookId: process.env.PAYPAL_PLATFORM_WEBHOOK_ID ?? null,
	};
}

// Los Billing Plans se crean UNA sola vez contra la cuenta de la agencia (ver
// prisma/setup-paypal-plans.ts), no por suscriptor — acá solo se referencia el ID ya creado.
function getBillingPlanId(plan: PlanCode): string {
	const envKey = PLAN_ID_ENV_KEY[plan];
	const id = process.env[envKey];
	if (!id) {
		throw new PayPalBillingNotConfiguredError(`Falta la env var ${envKey} — correr prisma/setup-paypal-plans.ts y cargar los IDs que imprime.`);
	}
	return id;
}

async function getAccessToken(config: PayPalConfig): Promise<string> {
	const auth = Buffer.from(`${config.clientId}:${config.secret}`).toString('base64');
	const res = await fetch(`${API_BASE[config.mode]}/v1/oauth2/token`, {
		method: 'POST',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) {
		throw new PayPalBillingRequestError(`No se pudo autenticar con PayPal (${res.status}). Revisá las credenciales en PlatformSetting (correr \`npm run copy:paypal-platform\` de nuevo si hace falta).`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

export type PayPalSubscriptionStatus = 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';

// `custom_id: tenantId` es cómo el webhook (que no tiene sesión ni request original) resuelve a qué
// tenant pertenece un evento de suscripción — mismo rol que `reference_id` cumple en lib/paypal.ts
// para las órdenes de ticket, pero acá SÍ se usa para resolver tenant (allá no, ver comentario en
// public.ts sobre por qué el webhook de tickets resuelve por paypalOrderId en vez de por reference).
export async function createSubscription(
	plan: PlanCode,
	tenantId: number,
	returnUrl: string,
	cancelUrl: string,
): Promise<{ paypalSubscriptionId: string; approveUrl: string }> {
	const config = await getPlatformConfig();
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v1/billing/subscriptions`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			plan_id: getBillingPlanId(plan),
			custom_id: String(tenantId),
			application_context: {
				brand_name: 'Seat App',
				user_action: 'SUBSCRIBE_NOW',
				return_url: returnUrl,
				cancel_url: cancelUrl,
			},
		}),
	});
	if (!res.ok) {
		throw new PayPalBillingRequestError(`No se pudo crear la suscripción de PayPal (${res.status}): ${await res.text()}`);
	}
	const data = (await res.json()) as { id: string; links: { rel: string; href: string }[] };
	const approveUrl = data.links.find((l) => l.rel === 'approve')?.href;
	if (!approveUrl) {
		throw new PayPalBillingRequestError('PayPal no devolvió un link de aprobación para la suscripción.');
	}
	return { paypalSubscriptionId: data.id, approveUrl };
}

export async function getSubscription(paypalSubscriptionId: string): Promise<{ status: PayPalSubscriptionStatus; nextBillingTime: string | null }> {
	const config = await getPlatformConfig();
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v1/billing/subscriptions/${paypalSubscriptionId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		throw new PayPalBillingRequestError(`No se pudo consultar la suscripción de PayPal (${res.status})`);
	}
	const data = (await res.json()) as { status: PayPalSubscriptionStatus; billing_info?: { next_billing_time?: string } };
	return { status: data.status, nextBillingTime: data.billing_info?.next_billing_time ?? null };
}

export async function cancelSubscription(paypalSubscriptionId: string, reason: string): Promise<void> {
	const config = await getPlatformConfig();
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ reason }),
	});
	// 204 No Content en éxito; PayPal también devuelve error si ya estaba cancelada — no hace falta
	// tratar eso como éxito silencioso acá porque quien llama (Super Admin, a mano) sí quiere saber.
	if (!res.ok && res.status !== 204) {
		throw new PayPalBillingRequestError(`No se pudo cancelar la suscripción de PayPal (${res.status}): ${await res.text()}`);
	}
}

// Mismo mecanismo que verifyWebhookSignature en lib/paypal.ts, pero con el Webhook ID de
// plataforma (fijo, no hay que resolver tenant antes de verificar como sí hace falta con tickets).
export async function verifyPlatformWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: unknown): Promise<boolean> {
	const config = await getPlatformConfig();
	if (!config.webhookId) return false;
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v1/notifications/verify-webhook-signature`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			auth_algo: headers['paypal-auth-algo'],
			cert_url: headers['paypal-cert-url'],
			transmission_id: headers['paypal-transmission-id'],
			transmission_sig: headers['paypal-transmission-sig'],
			transmission_time: headers['paypal-transmission-time'],
			webhook_id: config.webhookId,
			webhook_event: rawBody,
		}),
	});
	if (!res.ok) return false;
	const data = (await res.json()) as { verification_status?: string };
	return data.verification_status === 'SUCCESS';
}
