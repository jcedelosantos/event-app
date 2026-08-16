import { prisma } from './prisma';
import { centsToPayPalValue } from './money';

// Credenciales de PayPal por tenant, guardadas en AppSetting (ver settings.ts) bajo el namespace
// "payments.*" — mismo patrón ya usado para el color de acento. paypalSecret y paypalWebhookId
// NUNCA salen por GET /settings (ver el filtro de keys "*Secret"/"*WebhookId" en settings.ts).
const PAYPAL_KEYS = ['payments.paypalClientId', 'payments.paypalSecret', 'payments.paypalMode', 'payments.paypalWebhookId'] as const;

export class PayPalNotConfiguredError extends Error {}
export class PayPalRequestError extends Error {}

export type PayPalConfig = { clientId: string; secret: string; mode: 'sandbox' | 'live'; webhookId: string | null };

const API_BASE: Record<PayPalConfig['mode'], string> = {
	sandbox: 'https://api-m.sandbox.paypal.com',
	live: 'https://api-m.paypal.com',
};

async function getTenantConfig(tenantId: number): Promise<PayPalConfig> {
	const rows = await prisma.appSetting.findMany({ where: { tenantId, key: { in: [...PAYPAL_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const clientId = map['payments.paypalClientId'];
	const secret = map['payments.paypalSecret'];
	if (!clientId || !secret) {
		throw new PayPalNotConfiguredError('Este club todavía no configuró PayPal (Settings → Pagos).');
	}
	return {
		clientId,
		secret,
		mode: map['payments.paypalMode'] === 'live' ? 'live' : 'sandbox',
		webhookId: map['payments.paypalWebhookId'] ?? null,
	};
}

async function getAccessToken(config: PayPalConfig): Promise<string> {
	const auth = Buffer.from(`${config.clientId}:${config.secret}`).toString('base64');
	const res = await fetch(`${API_BASE[config.mode]}/v1/oauth2/token`, {
		method: 'POST',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) {
		throw new PayPalRequestError(`No se pudo autenticar con PayPal (${res.status}). Revisá el Client ID/Secret en Settings → Pagos.`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

export type PayPalOrderStatus = 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';

// reference guarda el/los codeQR del hold que esta orden cubre — sirve para reconciliar del lado de
// PayPal (aparece en su panel), no lo usamos para volver a resolver el tenant (eso se hace por
// paypalOrderId, ver public.ts).
export async function createOrder(tenantId: number, amountCents: number, reference: string): Promise<{ orderId: string }> {
	const config = await getTenantConfig(tenantId);
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v2/checkout/orders`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			intent: 'CAPTURE',
			purchase_units: [{ reference_id: reference, amount: { currency_code: 'USD', value: centsToPayPalValue(amountCents) } }],
		}),
	});
	if (!res.ok) {
		throw new PayPalRequestError(`No se pudo crear la orden de PayPal (${res.status}): ${await res.text()}`);
	}
	const data = (await res.json()) as { id: string };
	return { orderId: data.id };
}

// Idempotente a propósito: si la orden ya estaba capturada (ej. el webhook llegó antes que el
// capture del cliente, o viceversa), PayPal devuelve 422 ORDER_ALREADY_CAPTURED — se trata como
// éxito en vez de error, para que ninguno de los dos caminos rompa al otro.
export async function captureOrder(tenantId: number, orderId: string): Promise<{ status: PayPalOrderStatus; alreadyCaptured: boolean }> {
	const config = await getTenantConfig(tenantId);
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v2/checkout/orders/${orderId}/capture`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
	});
	const body = (await res.json().catch(() => null)) as { status?: PayPalOrderStatus; details?: { issue?: string }[] } | null;
	if (!res.ok) {
		if (body?.details?.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED')) {
			return { status: 'COMPLETED', alreadyCaptured: true };
		}
		throw new PayPalRequestError(`No se pudo capturar el pago de PayPal (${res.status}): ${JSON.stringify(body)}`);
	}
	return { status: body?.status ?? 'COMPLETED', alreadyCaptured: false };
}

export async function getOrderStatus(tenantId: number, orderId: string): Promise<PayPalOrderStatus> {
	const config = await getTenantConfig(tenantId);
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v2/checkout/orders/${orderId}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	if (!res.ok) {
		throw new PayPalRequestError(`No se pudo consultar la orden de PayPal (${res.status})`);
	}
	const data = (await res.json()) as { status: PayPalOrderStatus };
	return data.status;
}

// Confirma que el webhook realmente vino de PayPal (y no de cualquiera que le pegue a la URL) antes
// de confiar en su contenido — requiere el Webhook ID que se configura una sola vez al crear la
// suscripción del webhook en developer.paypal.com (ver Settings → Pagos).
export async function verifyWebhookSignature(
	tenantId: number,
	headers: Record<string, string | string[] | undefined>,
	rawBody: unknown,
): Promise<boolean> {
	const config = await getTenantConfig(tenantId);
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
