// Carga sostenida moderada mientras, A MANO, se fuerza un restart del servicio de staging desde
// Railway a la mitad de la corrida (mcp__railway__update_service o scale_service down/up) — el
// objetivo es confirmar que el servicio vuelve a responder solo y que no se disparan errores 5xx
// sostenidos más allá del downtime real del restart en sí.
//
// Requiere el fixture generado por scripts/seed.js (load-tests/.fixtures/scan-concurrency.json).
// Correr: k6 run scenarios/resilience.js
// Mientras corre (dura 3 minutos), a la mitad, reiniciar seat-app-load-test desde Railway y
// observar en el resumen final en qué ventana de tiempo se concentraron los errores.

import http from 'k6/http';
import { check, sleep } from 'k6';

const fixture = JSON.parse(open('../.fixtures/scan-concurrency.json'));

export const options = {
	scenarios: {
		sustained_during_restart: {
			executor: 'constant-vus',
			vus: 20,
			duration: '3m',
		},
	},
	thresholds: {
		// Sin threshold estricto de error rate — un restart SIEMPRE produce una ventana de errores
		// reales (eso es lo que se está midiendo). El resumen final documenta cuánto duró esa ventana.
	},
};

const headers = { Authorization: `Bearer ${fixture.token}` };

export default function () {
	const res = http.get(`${fixture.apiUrl}/sale-tickets?eventId=${fixture.eventId}`, { headers });
	check(res, { 'responde (no timeout)': (r) => r.status !== 0 });
	sleep(1);
}
