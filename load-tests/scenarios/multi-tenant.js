// Prueba el aislamiento multi-tenant bajo presión: N tenants distintos con su propio evento
// corriendo escaneos EN SIMULTÁNEO — el escenario que de verdad ejercita los índices por
// tenantId y el pool de conexiones compartido (Postgres es una sola instancia para todos los
// tenants, a diferencia del escenario de un solo evento grande).
//
// Requiere el fixture generado por scripts/seed.js (load-tests/.fixtures/multi-tenant.json).
// Correr: k6 run scenarios/multi-tenant.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const fixture = JSON.parse(open('../.fixtures/multi-tenant.json'));
const tenants = new SharedArray('tenants', () => fixture.tenants);

export const options = {
	scenarios: {
		concurrent_events: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '10s', target: 40 }, // ~2 scanners activos por tenant, todos los tenants a la vez
				{ duration: '40s', target: 40 },
				{ duration: '10s', target: 0 },
			],
		},
	},
	thresholds: {
		http_req_duration: ['p(95)<500', 'p(99)<1000'],
		http_req_failed: ['rate<0.01'],
	},
};

export default function () {
	const tenant = tenants[__VU % tenants.length];
	const idx = (__VU * 1000 + __ITER) % tenant.codeQRs.length;
	const codeQR = tenant.codeQRs[idx];

	const res = http.post(`${fixture.apiUrl}/scan`, JSON.stringify({ codeQR }), {
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenant.token}` },
		tags: { tenantId: String(tenant.tenantId) },
		responseCallback: http.expectedStatuses(200, 409),
	});

	check(res, {
		'status 200 o 409': (r) => r.status === 200 || r.status === 409,
		'no es 5xx': (r) => r.status < 500,
		'nunca ve datos de otro tenant (nunca 404 por cruce)': (r) => r.status !== 404,
	});

	sleep(0.1);
}
