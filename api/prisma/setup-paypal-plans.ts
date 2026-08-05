// Script de setup ÚNICO (no corre en cada deploy, a diferencia de seed.ts) — crea el Producto y los
// 4 Billing Plans de PayPal e imprime los IDs para pegar en las env vars que lee
// lib/paypal-billing.ts (PAYPAL_PLAN_ID_*). Idempotente: si el producto/plan ya existe (por
// nombre), lo reusa en vez de duplicarlo — corre `npm run setup:paypal-plans` las veces que haga
// falta sin miedo a crear planes repetidos en el panel de PayPal.
//
// A propósito NO usa credenciales de "agencia" separadas — lee de PlatformSetting (ver
// schema.prisma), poblada corriendo antes `npm run copy:paypal-platform` (mismo criterio que
// lib/paypal-billing.ts, ver el comentario ahí).

import { PLANS, type PlanCode } from '../src/lib/plans';
import { prisma } from '../src/lib/prisma';

const PRODUCT_NAME = 'Seat App — Suscripción';
const PLATFORM_KEYS = ['paypalClientId', 'paypalSecret', 'paypalMode'] as const;

async function getAccessTokenAndBase(): Promise<{ token: string; apiBase: string }> {
	const rows = await prisma.platformSetting.findMany({ where: { key: { in: [...PLATFORM_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const clientId = map['paypalClientId'];
	const secret = map['paypalSecret'];
	if (!clientId || !secret) {
		throw new Error('PlatformSetting todavía no tiene PayPal cargado — correr `npm run copy:paypal-platform` primero.');
	}
	const mode = map['paypalMode'] === 'live' ? 'live' : 'sandbox';
	const apiBase = mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
	console.log(`Usando el PayPal de plataforma en modo ${mode}.`);

	const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
	const res = await fetch(`${apiBase}/v1/oauth2/token`, {
		method: 'POST',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: 'grant_type=client_credentials',
	});
	if (!res.ok) throw new Error(`No se pudo autenticar con PayPal (${res.status}): ${await res.text()}`);
	const data = (await res.json()) as { access_token: string };
	return { token: data.access_token, apiBase };
}

async function ensureProduct(apiBase: string, token: string): Promise<string> {
	const list = await fetch(`${apiBase}/v1/catalogs/products?page_size=20`, { headers: { Authorization: `Bearer ${token}` } });
	if (list.ok) {
		const data = (await list.json()) as { products?: { id: string; name: string }[] };
		const existing = data.products?.find((p) => p.name === PRODUCT_NAME);
		if (existing) {
			console.log(`Producto ya existe: ${existing.id}`);
			return existing.id;
		}
	}
	const res = await fetch(`${apiBase}/v1/catalogs/products`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ name: PRODUCT_NAME, type: 'SERVICE', category: 'SOFTWARE' }),
	});
	if (!res.ok) throw new Error(`No se pudo crear el producto (${res.status}): ${await res.text()}`);
	const data = (await res.json()) as { id: string };
	console.log(`Producto creado: ${data.id}`);
	return data.id;
}

async function ensurePlan(apiBase: string, token: string, productId: string, plan: (typeof PLANS)[PlanCode]): Promise<string> {
	const list = await fetch(`${apiBase}/v1/billing/plans?product_id=${productId}&page_size=20`, { headers: { Authorization: `Bearer ${token}` } });
	if (list.ok) {
		const data = (await list.json()) as { plans?: { id: string; name: string }[] };
		const existing = data.plans?.find((p) => p.name === plan.name);
		if (existing) {
			console.log(`Plan "${plan.name}" ya existe: ${existing.id}`);
			return existing.id;
		}
	}
	const res = await fetch(`${apiBase}/v1/billing/plans`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			product_id: productId,
			name: plan.name,
			description: `Plan ${plan.name} — hasta ${plan.attendeesPerEvent} asistentes por evento`,
			billing_cycles: [
				{
					frequency: { interval_unit: 'MONTH', interval_count: 1 },
					tenure_type: 'REGULAR',
					sequence: 1,
					total_cycles: 0, // 0 = indefinido, se renueva hasta que se cancele
					pricing_scheme: { fixed_price: { value: plan.priceUSD.toFixed(2), currency_code: 'USD' } },
				},
			],
			payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 3 },
		}),
	});
	if (!res.ok) throw new Error(`No se pudo crear el plan "${plan.name}" (${res.status}): ${await res.text()}`);
	const data = (await res.json()) as { id: string };
	console.log(`Plan "${plan.name}" creado: ${data.id}`);
	return data.id;
}

async function main() {
	const { token, apiBase } = await getAccessTokenAndBase();
	const productId = await ensureProduct(apiBase, token);

	const envLines: string[] = [];
	for (const code of Object.keys(PLANS) as PlanCode[]) {
		const planId = await ensurePlan(apiBase, token, productId, PLANS[code]);
		envLines.push(`PAYPAL_PLAN_ID_${code}="${planId}"`);
	}

	console.log('\nPegá esto en las env vars de la API:\n');
	console.log(envLines.join('\n'));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
