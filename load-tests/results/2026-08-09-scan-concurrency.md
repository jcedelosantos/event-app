# scan-concurrency — 2026-08-09

Escenario: puerta de un evento grande abriendo de golpe. 50 VUs concurrentes escaneando
(`POST /scan`) contra un solo evento con 3000 codeQRs reales, rampa 0→50 en 10s, sostenido 30s,
baja a 0 en 10s. Correspondiente a `scenarios/scan-concurrency.js`, environment `load-test`
(Postgres propio, aislado de producción).

## Resultado: PASA

- `http_req_duration` p(95) = 424.61ms, p(99) = 572.81ms (umbral: p95<500ms, p99<1000ms)
- `http_req_failed` = 0.00% (umbral: <1%) — 0 errores 5xx en 5664 requests
- Throughput sostenido: ~113 req/s
- 5664 iteraciones completadas, 226 checks/s, 100% de los checks de negocio (200 o 409) en verde

## Nota metodológica

La primera corrida marcó 80.89% de "fallos" en `http_req_failed` — falso positivo: k6 clasifica
por default cualquier respuesta no-2xx/3xx como fallo HTTP, y una vez que la rampa agotó el pool
de 3000 codeQRs únicos (a los ~26s con 50 VUs sostenidos), las iteraciones siguientes reciben 409
("ya escaneado") legítimamente — comportamiento de negocio correcto, no un error. Se corrigió con
`responseCallback: http.expectedStatuses(200, 409)` en el script para que la métrica refleje
errores reales (5xx) y no ruido de negocio.

## Hallazgo

Ningún cuello de botella a este nivel de carga — ni siquiera una señal de saturación de
conexiones a Postgres (sospecha inicial por `new PrismaClient()` sin pool en
`api/src/lib/prisma.ts`). La latencia se mantuvo estable durante todo el sostenido, sin
degradación progresiva. El verdadero techo se busca en `stress-ramp.js` (rampa mucho más alta,
hasta romper).
