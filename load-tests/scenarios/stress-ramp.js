// Rampa hasta encontrar el punto de quiebre real, más allá de la meta de 500 clientes — el
// objetivo es que ESTO FALLE en algún punto, para saber dónde está el techo, no confirmar que el
// piso aguanta. Usa los mismos endpoints de lectura que dashboard-polling.js (idempotentes, no se
// quedan sin fixtures a mitad de la rampa como pasaría escaneando codeQRs de a uno).
//
// Requiere el fixture generado por scripts/seed.js (load-tests/.fixtures/scan-concurrency.json).
// Correr: k6 run scenarios/stress-ramp.js
// Mirar en qué escalón empiezan a aparecer errores/latencia disparada — ESE es el hallazgo, no
// "pasó" o "no pasó" el threshold.

import http from 'k6/http';
import { check } from 'k6';

const fixture = JSON.parse(open('../.fixtures/scan-concurrency.json'));

export const options = {
	scenarios: {
		find_the_ceiling: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '30s', target: 50 },
				{ duration: '30s', target: 100 },
				{ duration: '30s', target: 200 },
				{ duration: '30s', target: 400 },
				{ duration: '30s', target: 800 },
				{ duration: '30s', target: 0 },
			],
		},
	},
	thresholds: {
		// No aborta la corrida — solo documenta desde qué punto se considera "roto" al leer el resumen.
		http_req_duration: ['p(95)<2000'],
		http_req_failed: ['rate<0.05'],
	},
};

const headers = { Authorization: `Bearer ${fixture.token}` };

export default function () {
	const res = http.get(`${fixture.apiUrl}/sale-tickets?eventId=${fixture.eventId}`, { headers });
	check(res, { 'no es 5xx': (r) => r.status < 500 });
}
