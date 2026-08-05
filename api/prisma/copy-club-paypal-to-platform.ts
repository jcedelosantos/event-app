// Puebla PlatformSetting (ver schema.prisma) copiando, UNA VEZ, el PayPal ya configurado en el
// tenant indicado — por defecto el club de prueba — a la config de plataforma que usa
// lib/paypal-billing.ts para cobrar la suscripción recurrente. Después de correr esto, la config de
// plataforma vive independiente: si el club cambia su propio PayPal de tickets más adelante, no
// afecta lo que ya se copió acá.
//
// Uso: npm run copy:paypal-platform -- club-deportivo-naco   (el slug es opcional, default de abajo)

import { prisma, prismaUnscoped } from '../src/lib/prisma';

const DEFAULT_SLUG = 'club-deportivo-naco';
const APP_SETTING_KEYS = ['payments.paypalClientId', 'payments.paypalSecret', 'payments.paypalMode'] as const;

async function main() {
	const slug = process.argv[2] ?? DEFAULT_SLUG;

	// prismaUnscoped a propósito para resolver el Tenant por slug (mismo criterio que public.ts,
	// tenants.ts) — todavía no conocemos su tenantId, es lo que estamos por resolver.
	const tenant = await prismaUnscoped.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
	if (!tenant) {
		throw new Error(`No existe ningún tenant con slug "${slug}".`);
	}

	const rows = await prisma.appSetting.findMany({ where: { tenantId: tenant.id, key: { in: [...APP_SETTING_KEYS] } } });
	const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const clientId = map['payments.paypalClientId'];
	const secret = map['payments.paypalSecret'];
	if (!clientId || !secret) {
		throw new Error(`"${tenant.name}" (${slug}) todavía no tiene PayPal configurado en Settings → Pagos — no hay nada que copiar.`);
	}
	const mode = map['payments.paypalMode'] === 'live' ? 'live' : 'sandbox';

	await prisma.$transaction([
		prisma.platformSetting.upsert({ where: { key: 'paypalClientId' }, create: { key: 'paypalClientId', value: clientId }, update: { value: clientId } }),
		prisma.platformSetting.upsert({ where: { key: 'paypalSecret' }, create: { key: 'paypalSecret', value: secret }, update: { value: secret } }),
		prisma.platformSetting.upsert({ where: { key: 'paypalMode' }, create: { key: 'paypalMode', value: mode }, update: { value: mode } }),
	]);

	console.log(`Copiado el PayPal de "${tenant.name}" (${slug}, modo ${mode}) a PlatformSetting.`);
	console.log('Ahora correr `npm run setup:paypal-plans` para crear los Billing Plans con esta cuenta.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
