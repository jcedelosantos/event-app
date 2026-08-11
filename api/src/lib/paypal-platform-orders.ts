// Pago ÚNICO cobrado por la PLATAFORMA (no por un tenant a su comprador, ver lib/paypal.ts; no
// recurrente, ver lib/paypal-billing.ts) — usado para el checkout de un tenant de evento único
// (ver routes/signup-event.ts). Misma lógica de Orders v2 que lib/paypal.ts, pero resolviendo
// credenciales con getPlatformConfig() (PlatformSetting) en vez de credenciales por tenant.
import { getPlatformConfig, PayPalBillingNotConfiguredError, PayPalBillingRequestError } from './paypal-billing';
import { PayPalConfig, PayPalOrderStatus } from './paypal';

const API_BASE: Record<PayPalConfig['mode'], string> = {
	sandbox: 'https://api-m.sandbox.paypal.com',
	live: 'https://api-m.paypal.com',
};

async function getAccessToken(config: PayPalConfig): Promise<string> {
	const auth = Buffer.from(`${config.clientId}:${config.secret}`).toString('base64');
	const res = await fetch(`${API_BASE[config.mode]}/v1/oauth2/token`, {
		method: 'POST',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) {
		throw new PayPalBillingRequestError(`No se pudo autenticar con el PayPal de plataforma (${res.status}).`);
	}
	const data = (await res.json()) as { access_token: string };
	return data.access_token;
}

// reference guarda el slug del tenant que se está dando de alta — sirve para reconciliar del lado
// de PayPal, no se usa para resolver el tenant de vuelta (eso lo hace el frontend pasando
// tenantId explícito a /signup-event/capture).
export async function createPlatformOrder(amountUSD: number, reference: string): Promise<{ orderId: string }> {
	const config = await getPlatformConfig();
	const token = await getAccessToken(config);
	const res = await fetch(`${API_BASE[config.mode]}/v2/checkout/orders`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			intent: 'CAPTURE',
			purchase_units: [{ reference_id: reference, amount: { currency_code: 'USD', value: amountUSD.toFixed(2) } }],
		}),
	});
	if (!res.ok) {
		throw new PayPalBillingRequestError(`No se pudo crear la orden de PayPal (${res.status}): ${await res.text()}`);
	}
	const data = (await res.json()) as { id: string };
	return { orderId: data.id };
}

// Idempotente a propósito, mismo motivo que lib/paypal.ts: si la orden ya estaba capturada (ej.
// el cliente reintentó el capture tras un timeout de red), PayPal devuelve 422
// ORDER_ALREADY_CAPTURED — se trata como éxito.
export async function capturePlatformOrder(orderId: string): Promise<{ status: PayPalOrderStatus; alreadyCaptured: boolean }> {
	const config = await getPlatformConfig();
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
		throw new PayPalBillingRequestError(`No se pudo capturar el pago de PayPal (${res.status}): ${JSON.stringify(body)}`);
	}
	return { status: body?.status ?? 'COMPLETED', alreadyCaptured: false };
}

export { PayPalBillingNotConfiguredError as PayPalPlatformNotConfiguredError, PayPalBillingRequestError as PayPalPlatformRequestError };
