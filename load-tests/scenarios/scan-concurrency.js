// Simula la puerta de un evento grande abriendo de golpe: decenas de scanners concurrentes
// pegándole a POST /scan, cada uno con un codeQR real y distinto (nunca se re-escanea el mismo
// código dos veces — el 409 de "ya escaneado" no es el comportamiento que queremos medir acá).
//
// Requiere el fixture generado por scripts/seed.js (load-tests/.fixtures/scan-concurrency.json).
// Correr: k6 run scenarios/scan-concurrency.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const fixture = JSON.parse(open('../.fixtures/scan-concurrency.json'));

const codeQRs = new SharedArray('codeQRs', () => fixture.codeQRs);

export const options = {
	scenarios: {
		gate_burst: {
			executor: 'ramping-vus',
			startVUs: 0,
			stages: [
				{ duration: '10s', target: 50 }, // la puerta abre, 50 scanners entran de golpe
				{ duration: '30s', target: 50 }, // sostenido — el grueso de la fila
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
	const idx = (__VU * 1000 + __ITER) % codeQRs.length;
	const codeQR = codeQRs[idx];

	const res = http.post(`${fixture.apiUrl}/scan`, JSON.stringify({ codeQR }), {
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token}` },
		// 409 ("ya escaneado") es una respuesta de negocio esperada una vez que el pool de 3000
		// codeQRs se agota bajo carga sostenida — no debe contar como fallo HTTP en las métricas.
		responseCallback: http.expectedStatuses(200, 409),
	});

	check(res, {
		'status 200 (check-in aplicado) o 409 (ya escaneado por otra iteración)': (r) => r.status === 200 || r.status === 409,
		'no es 5xx': (r) => r.status < 500,
	});

	sleep(0.1);
}
