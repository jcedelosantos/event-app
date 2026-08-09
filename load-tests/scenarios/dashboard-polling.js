// Carga de fondo constante simulando varios operadores con la pantalla de QRs/Dashboard abierta
// a la vez, cada uno haciendo polling cada 5-10s (ver LIVE_REFRESH_MS en qrs.component.ts) — no
// es tráfico de escaneo, es lectura repetida mientras el evento está en curso.
//
// Requiere el fixture generado por scripts/seed.js (load-tests/.fixtures/scan-concurrency.json).
// Correr: k6 run scenarios/dashboard-polling.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const fixture = JSON.parse(open('../.fixtures/scan-concurrency.json'));

export const options = {
	scenarios: {
		operators_watching: {
			executor: 'constant-vus',
			vus: 15, // 15 operadores con la pantalla abierta a la vez, escala realista para un evento grande
			duration: '60s',
		},
	},
	thresholds: {
		http_req_duration: ['p(95)<400'],
		http_req_failed: ['rate<0.01'],
	},
};

const headers = { Authorization: `Bearer ${fixture.token}` };

export default function () {
	const responses = http.batch([
		['GET', `${fixture.apiUrl}/sale-tickets?eventId=${fixture.eventId}`, null, { headers }],
		['GET', `${fixture.apiUrl}/sale-products?eventId=${fixture.eventId}`, null, { headers }],
		['GET', `${fixture.apiUrl}/access-points/stats?eventId=${fixture.eventId}`, null, { headers }],
	]);

	for (const res of responses) {
		check(res, { 'no es 5xx': (r) => r.status < 500 });
	}

	sleep(5); // mismo intervalo que LIVE_REFRESH_MS del frontend
}
