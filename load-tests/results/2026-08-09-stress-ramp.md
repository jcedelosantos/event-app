# stress-ramp — 2026-08-09

Escenario: rampa 50→800 VUs contra `GET /sale-tickets?eventId=X` (mismo endpoint que
`dashboard-polling.js`), evento de 3000 tickets, buscando a propósito el punto de quiebre real
(`scenarios/stress-ramp.js`). El objetivo de este escenario es que rompa — y rompió.

## Resultado

- `http_req_failed` = **100.00%** — todos los requests completados terminaron en timeout de 60s
  de k6 (`request timeout`), no en un error HTTP real del servidor
- `http_req_duration` p(95) = 1m0s (tope del timeout)
- 757 iteraciones completas + 457 interrumpidas por el corte de la rampa (`max VUs=800`)
- El servicio NUNCA devolvió un 5xx — simplemente dejó de responder a este endpoint bajo carga

## No es un hallazgo nuevo — es el mismo bug de `dashboard-polling.js`, amplificado

`GET /sale-tickets?eventId=X` ya se había identificado como lento incluso SIN concurrencia
(15-20s para 3000 tickets, ver `2026-08-09-dashboard-polling.md`). Esta corrida confirma que ese
mismo endpoint, bajo concurrencia creciente, es el techo real del sistema — no CPU, no memoria,
no el pool de conexiones: es esta query puntual. No hace falta seguir subiendo VUs para
"encontrar el techo" en otro lado; el techo ya apareció al segundo escalón de la rampa (~50-100
VUs) contra este endpoint específico.

## Por qué no se corrigió en esta misma vuelta

`GET /sale-tickets?eventId=X` sin límite es el contrato que hoy consumen varias pantallas del
manager (panel de QRs, event-details, dashboard) para calcular totales y renderizar la tabla
completa de un evento — cambiar su forma (paginar, recortar el `include`) es un cambio que toca
varios componentes del frontend a la vez, no un ajuste de una línea como el intento de
`connection_limit`. Después de esa reversión, la prioridad pasó a ser no repetir un cambio
apurado y sin verificar en un endpoint del que dependen varias pantallas reales — se documenta
el hallazgo con evidencia sólida y se deja como recomendación concreta, no como fix forzado.

## Recomendación (sin ejecutar todavía)

Este es el hallazgo más importante de toda la Fase 2 — antes de seguir con la Fase 3 (simulacro
"evento fantasma") tiene sentido corregir esto primero, porque cualquier simulacro que incluya
un evento grande va a chocar con el mismo techo y no va a medir nada nuevo. Ver
`2026-08-09-dashboard-polling.md` para las 3 opciones concretas evaluadas (paginar, `EXPLAIN
ANALYZE`, recortar el `include`).

## Corrección + fix aplicado (ver detalle completo en `2026-08-09-dashboard-polling.md`)

La medición de arriba (100% timeout) se hizo con k6 corriendo desde la máquina local, la misma
que mostró fallas de red intermitentes durante toda la sesión. Medido DENTRO del contenedor (sin
salir a internet), la query real tarda 581ms y el request HTTP completo 751ms para 3000 filas —
el servidor nunca estuvo "roto", el problema real era el tamaño del payload (7.4MB) sumado a la
inestabilidad de la red local usada para medir.

Aplicado el mismo fix que en `dashboard-polling` (recorte de payload en `GET /sale-tickets`,
-68% de bytes). Repetida esta misma corrida (rampa 50→800 VUs) después del fix:

- `http_req_failed` siguió en 100% a esa escala de concurrencia — pero `data_received` (14MB
  para 1116 requests "completos") no cuadra con 1116 × ~2.4MB (~2.7GB): la gran mayoría de las
  conexiones nunca llegaron a bajar el payload completo, lo que apunta a que **la máquina local
  que corre k6 no puede sostener 800 conexiones HTTP simultáneas reales** (saturación del propio
  cliente, no del servidor) — no una prueba válida del techo real de Railway/Postgres a esa
  escala.

**Conclusión metodológica**: para medir el techo real a cientos de VUs concurrentes hace falta
correr k6 desde una máquina con ancho de banda/confiabilidad de nivel servidor (una VM en la
nube, o el propio Railway), no desde este sandbox local — queda como prerrequisito de
infraestructura para una vuelta futura de stress-testing a esta escala, no como un hallazgo
más del sistema en sí.
