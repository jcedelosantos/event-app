// Genera fixtures sintéticos contra el environment de staging (load-test) SIEMPRE vía las rutas
// HTTP reales — nunca inserts directos a la base — para ejercitar el mismo código que un cliente
// real usaría. Nunca correr contra producción: confirma la URL antes de tirar datos de prueba.
//
// Uso: API_URL=https://seat-app-load-test-load-test.up.railway.app node scripts/seed.js
//
// Salida: load-tests/.fixtures/scan-concurrency.json  (1 tenant, 1 evento, muchos SaleTickets)
//         load-tests/.fixtures/multi-tenant.json       (N tenants, 1 evento c/u, M tickets c/u)

const fs = require('fs');

const API = process.env.API_URL;
if (!API || API.includes('seat-app-production')) {
	console.error('API_URL debe apuntar al environment load-test, nunca a producción. Aborta.');
	process.exit(1);
}

const SCAN_CONCURRENCY_TICKETS = Number(process.env.SCAN_TICKETS ?? 2000);
const MULTI_TENANT_COUNT = Number(process.env.TENANT_COUNT ?? 20);
const MULTI_TENANT_TICKETS_PER_EVENT = Number(process.env.TICKETS_PER_TENANT ?? 100);

async function j(method, path, body, token, attempt = 1) {
	let res;
	try {
		res = await fetch(`${API}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
	} catch (err) {
		if (attempt < 3) {
			await new Promise((r) => setTimeout(r, 1000 * attempt));
			return j(method, path, body, token, attempt + 1);
		}
		throw err;
	}
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}
	if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
	return data;
}

function chunk(arr, size) {
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

async function setupTenantWithEvent(rootToken, { tenantName, suffix, ticketCount }) {
	let tenantId;
	let token = rootToken;
	if (tenantName) {
		const created = await j(
			'POST',
			'/tenants',
			{ name: tenantName, type: 'GENERAL', admin: { username: `loadtest-${suffix}`, password: 'loadtest123', name: 'Load', lastname: 'Test', email: `loadtest-${suffix}@test.local` } },
			rootToken,
		);
		tenantId = created.id;
		const login = await j('POST', '/auth/login', { username: `loadtest-${suffix}`, password: 'loadtest123' });
		token = login.token;
	}

	const map = await j('POST', '/maps', { name: `LoadTest-Map-${suffix}` }, token);
	const area = await j('POST', '/areas', { name: `LoadTest-Area-${suffix}`, mapId: map.id }, token);
	const now = new Date();
	const event = await j(
		'POST',
		'/events',
		{ name: `LoadTest-Event-${suffix}`, type: 'default', dateOn: now.toISOString(), dateOff: new Date(now.getTime() + 6 * 3600_000).toISOString(), mapId: map.id },
		token,
	);
	const ticket = await j('POST', '/tickets', { name: 'General', type: 'default', count: ticketCount + 10, price: 10, eventId: event.id }, token);

	const seatNames = Array.from({ length: ticketCount }, (_, i) => `S${i}`);
	for (const batch of chunk(seatNames, 1000)) {
		await j('POST', '/seats/bulk', { seats: batch.map((name) => ({ name, areaId: area.id })) }, token);
	}

	const rows = seatNames.map((seatName, i) => ({ name: `LoadTest`, lastname: `Attendee${i}`, seatName, paidType: 'Efectivo' }));
	for (const batch of chunk(rows, 1000)) {
		const result = await j('POST', '/sale-tickets/bulk-import', { eventId: event.id, ticketId: ticket.id, rows: batch }, token);
		if (result.skipped.length) console.warn(`  ${result.skipped.length} filas omitidas en el bulk-import:`, result.skipped.slice(0, 3));
	}

	const sales = await j('GET', `/sale-tickets?eventId=${event.id}`, null, token);
	const codeQRs = sales.map((s) => s.codeQR);

	return { tenantId, token, eventId: event.id, codeQRs };
}

async function main() {
	const { token: scanToken } = await j('POST', '/auth/login', { username: 'admin', password: '1234' });
	const { token: rootToken } = await j('POST', '/auth/login', { username: 'superadmin', password: '1234' });
	console.log('Login admin (Demo) + Super Admin OK');

	if (process.env.SKIP_SCAN !== '1') {
		console.log(`\n== Fixture: scan-concurrency (${SCAN_CONCURRENCY_TICKETS} tickets, 1 evento) ==`);
		const scanFixture = await setupTenantWithEvent(scanToken, { suffix: `sc-${Date.now()}`, ticketCount: SCAN_CONCURRENCY_TICKETS });
		fs.writeFileSync(
			`${__dirname}/../.fixtures/scan-concurrency.json`,
			JSON.stringify({ apiUrl: API, token: scanFixture.token, eventId: scanFixture.eventId, codeQRs: scanFixture.codeQRs }, null, 2),
		);
		console.log(`OK: ${scanFixture.codeQRs.length} codeQRs generados`);
	} else {
		console.log('\n== Fixture: scan-concurrency — SKIP_SCAN=1, se conserva el fixture existente ==');
	}

	console.log(`\n== Fixture: multi-tenant (${MULTI_TENANT_COUNT} tenants x ${MULTI_TENANT_TICKETS_PER_EVENT} tickets) ==`);
	const tenants = [];
	for (let t = 0; t < MULTI_TENANT_COUNT; t++) {
		const suffix = `mt-${Date.now()}-${t}`;
		const result = await setupTenantWithEvent(rootToken, { tenantName: `LoadTest Tenant ${t}`, suffix, ticketCount: MULTI_TENANT_TICKETS_PER_EVENT });
		tenants.push({ tenantId: result.tenantId, token: result.token, eventId: result.eventId, codeQRs: result.codeQRs });
		process.stdout.write('.');
	}
	fs.writeFileSync(`${__dirname}/../.fixtures/multi-tenant.json`, JSON.stringify({ apiUrl: API, tenants }, null, 2));
	console.log(`\nOK: ${tenants.length} tenants generados`);

	console.log('\nListo. Fixtures en load-tests/.fixtures/');
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
