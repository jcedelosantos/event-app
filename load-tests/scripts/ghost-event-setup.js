// Fase 3 — arma el "evento fantasma": un tenant CHURCH con puertas configuradas (una restringida,
// dos abiertas), dos tipos de ticket, y familias con Child registrados — todo vía rutas HTTP
// reales, igual que scripts/seed.js. Nunca correr contra producción.
//
// Uso: API_URL=https://seat-app-load-test-load-test.up.railway.app node scripts/ghost-event-setup.js

const fs = require('fs');

const API = process.env.API_URL;
if (!API || API.includes('seat-app-production')) {
	console.error('API_URL debe apuntar al environment load-test, nunca a producción. Aborta.');
	process.exit(1);
}

const GENERAL_TICKETS = Number(process.env.GENERAL_TICKETS ?? 700);
const VIP_TICKETS = Number(process.env.VIP_TICKETS ?? 100);
const FAMILIES = Number(process.env.FAMILIES ?? 150); // cuántas SaleTicket generales tienen 1-2 Child

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

async function main() {
	const { token: rootToken } = await j('POST', '/auth/login', { username: 'superadmin', password: '1234' });
	console.log('Login Super Admin OK');

	const suffix = `ghost-${Date.now()}`;
	const tenant = await j(
		'POST',
		'/tenants',
		{ name: `Iglesia Fantasma ${suffix}`, type: 'CHURCH', admin: { username: `ghost-${suffix}`, password: 'ghost123', name: 'Ghost', lastname: 'Admin', email: `ghost-${suffix}@test.local` } },
		rootToken,
	);
	const { token } = await j('POST', '/auth/login', { username: `ghost-${suffix}`, password: 'ghost123' });
	console.log('Tenant CHURCH creado:', tenant.id);

	const map = await j('POST', '/maps', { name: `Ghost-Map-${suffix}` }, token);
	const area = await j('POST', '/areas', { name: `Ghost-Area-${suffix}`, mapId: map.id }, token);

	const now = new Date();
	const event = await j(
		'POST',
		'/events',
		{
			name: `Evento Fantasma ${suffix}`,
			type: 'default',
			dateOn: now.toISOString(),
			dateOff: new Date(now.getTime() + 6 * 3600_000).toISOString(),
			mapId: map.id,
			hostName: 'Pastor de Prueba',
			maxHostGuests: 2,
		},
		token,
	);
	console.log('Evento creado:', event.id);

	const totalSeats = GENERAL_TICKETS + VIP_TICKETS;
	const seatNames = Array.from({ length: totalSeats }, (_, i) => `G${i}`);
	for (const batch of chunk(seatNames, 1000)) {
		await j('POST', '/seats/bulk', { seats: batch.map((name) => ({ name, areaId: area.id })) }, token);
	}
	console.log(`${totalSeats} asientos creados`);

	const generalTicket = await j('POST', '/tickets', { name: 'General', type: 'default', count: GENERAL_TICKETS + 10, price: 10, eventId: event.id }, token);
	const vipTicket = await j('POST', '/tickets', { name: 'VIP', type: 'default', count: VIP_TICKETS + 10, price: 50, eventId: event.id }, token);

	const puertaPrincipal = await j('POST', '/access-points', { name: 'Puerta Principal', eventId: event.id }, token); // abierta
	const puertaVip = await j('POST', '/access-points', { name: 'Puerta VIP', eventId: event.id, ticketIds: [vipTicket.id] }, token); // restringida
	const puertaFamilias = await j('POST', '/access-points', { name: 'Puerta Familias', eventId: event.id }, token); // abierta
	console.log('3 puertas creadas (1 restringida a VIP)');

	const generalRows = seatNames.slice(0, GENERAL_TICKETS).map((seatName, i) => ({ name: 'Asistente', lastname: `General${i}`, seatName, paidType: 'Efectivo' }));
	const vipRows = seatNames.slice(GENERAL_TICKETS).map((seatName, i) => ({ name: 'Asistente', lastname: `VIP${i}`, seatName, paidType: 'Efectivo' }));
	for (const batch of chunk(generalRows, 1000)) {
		await j('POST', '/sale-tickets/bulk-import', { eventId: event.id, ticketId: generalTicket.id, rows: batch }, token);
	}
	for (const batch of chunk(vipRows, 1000)) {
		await j('POST', '/sale-tickets/bulk-import', { eventId: event.id, ticketId: vipTicket.id, rows: batch }, token);
	}
	console.log(`${GENERAL_TICKETS} tickets General + ${VIP_TICKETS} tickets VIP importados`);

	const sales = await j('GET', `/sale-tickets?eventId=${event.id}`, null, token);
	const generalSales = sales.filter((s) => s.ticketId === generalTicket.id);
	const vipSales = sales.filter((s) => s.ticketId === vipTicket.id);

	// Familias: para las primeras FAMILIES ventas generales, registrar 1-2 Child del mismo padre
	// (clientId de la venta) — genera un codeQR de familia real vía POST /children.
	const childCodeQRs = [];
	for (const sale of generalSales.slice(0, FAMILIES)) {
		const kidsCount = 1 + (sale.id % 2); // alterna 1 o 2 hijos
		for (let k = 0; k < kidsCount; k++) {
			const child = await j('POST', '/children', { name: `Hijo${k}-${sale.id}`, age: 8, eventId: event.id, parentId: sale.client.id }, token);
			childCodeQRs.push(child.codeQR);
		}
	}
	console.log(`${childCodeQRs.length} Child registrados en ${Math.min(FAMILIES, generalSales.length)} familias`);

	const fixture = {
		apiUrl: API,
		token,
		eventId: event.id,
		accessPoints: { principal: puertaPrincipal.id, vip: puertaVip.id, familias: puertaFamilias.id },
		generalCodeQRs: generalSales.map((s) => s.codeQR),
		vipCodeQRs: vipSales.map((s) => s.codeQR),
		childCodeQRs: [...new Set(childCodeQRs)], // resolveFamilyCodeQR puede repetir el mismo código por padre
	};
	fs.writeFileSync(`${__dirname}/../.fixtures/ghost-event.json`, JSON.stringify(fixture, null, 2));
	console.log('\nListo. Fixture en load-tests/.fixtures/ghost-event.json');
	console.log(`Total codeQRs escaneables: ${fixture.generalCodeQRs.length + fixture.vipCodeQRs.length + fixture.childCodeQRs.length}`);
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
