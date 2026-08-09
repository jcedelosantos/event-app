# dashboard-polling — 2026-08-09

Escenario: 15 operadores con la pantalla de QRs/Dashboard abierta a la vez, cada uno haciendo
`http.batch()` de `GET /sale-tickets?eventId=X`, `GET /sale-products?eventId=X` y
`GET /access-points/stats?eventId=X` cada 5s (`scenarios/dashboard-polling.js`), contra el
evento de 3000 tickets del fixture `scan-concurrency`.

## Resultado: NO PASA — hallazgo real, no ruido de la metodología

- `http_req_failed` = 33.33% — exactamente 1 de cada 3 requests por batch
- De esos, `checks_succeeded` = 100% (`no es 5xx` sigue en verde: la request NUNCA falla con un
  error, se queda colgada hasta el timeout de 60s de k6)
- `http_req_duration` p(95) = 59.77s, max = 59.8s — el 1/3 que falla lo hace SIEMPRE al tope del
  timeout

## Diagnóstico

Aislado con `curl` fuera de k6 (sin concurrencia, un solo request a la vez) contra el MISMO
evento de 3000 tickets:

| Endpoint | Tiempo |
|---|---|
| `GET /sale-tickets?eventId=X` (3000 tickets) | 15–20s |
| `GET /sale-products?eventId=X` (evento sin productos) | 2.8s |
| `GET /access-points/stats?eventId=X` | 0.4s |

`GET /sale-tickets` es el único de los tres lento, y lo es incluso SIN concurrencia — no es un
problema de contención (a diferencia del hallazgo de `multi-tenant`), es lento por sí solo.

Contra el evento de 120 tickets del fixture `multi-tenant` (mismo endpoint, mismo código, mismo
environment): **1.09s**. 25x menos tickets → 15-18x menos tiempo — la relación es peor que
lineal, lo que apunta a algo parecido a un patrón N+1 en vez de una sola query batcheada, no
solo "más filas tardan más".

`api/src/routes/sale-tickets.ts` (`saleTicketInclude`): cada fila trae `event`, `seat.area`,
`ticket`, `client.type`, `seller.type` completos — para 3000 filas eso es un payload grande
(en la corrida de k6 se vieron ~24MB recibidos en 45 requests) más el trabajo de armar y
serializar esos objetos anidados.

El propio comentario en el código (`sale-tickets.ts`, sobre `ALL_EVENTS_LIST_LIMIT`) asume que
"el volumen de un solo evento está naturalmente acotado por su aforo, nunca llega a ser un
problema" — este load test lo desmiente: un evento real de una iglesia o club grande puede
perfectamente tener miles de asistentes.

## No se aplicó un fix a ciegas esta vez

Después del intento fallido de `connection_limit` en el escenario anterior (ver
`2026-08-09-multi-tenant.md`), se optó por NO tocar código sin poder verificar la causa exacta
con `EXPLAIN ANALYZE` (bloqueado por la misma falla intermitente de `railway ssh` hacia el
control plane de Railway esta sesión). Recomendación concreta para la próxima vuelta, en orden
de impacto probable:

1. **Paginar `GET /sale-tickets?eventId=X`** (mismo patrón que `ALL_EVENTS_LIST_LIMIT` ya usado
   para la vista sin `eventId`) — el panel de QRs no necesita las 3000 filas de una sola vez.
2. Confirmar con `EXPLAIN ANALYZE` si el include genera N+1 real o si el costo está en la
   serialización — cambia la solución (índices vs. reducir el `select`).
3. Repetir esta misma prueba en `stress-ramp.js` (usa el mismo endpoint) para ver si el
   comportamiento se agrava aún más bajo VUs crecientes.

## Nota

El threshold de `http_req_duration p(95)<400ms` del script era razonable como meta para
`access-points/stats` y `sale-products`, pero enmascaró que estaba promediando 2 endpoints
rápidos con uno roto. Queda documentado así — no se relaja el threshold, se documenta el fallo
como el hallazgo real que es.

## Corrección del diagnóstico (medido desde DENTRO del contenedor, sin red local de por medio)

Los 15-20s de arriba se midieron con `curl` desde la máquina local, la misma que mostró fallas de
red intermitentes toda la sesión (timeout de `fetch` durante el seed, resets de conexión por SSH
al control plane de Railway). Para descartar que la lentitud fuera del lado del cliente y no del
servidor, se corrió la query real (vía Prisma, incluyendo el include completo) y luego el request
HTTP contra `localhost:3001` **desde dentro del propio contenedor** (`railway ssh` + `node`, sin
salir a internet):

| Medición | Resultado |
|---|---|
| Query Prisma con include completo (3000 filas), en el server | **581ms** |
| `GET /sale-tickets?eventId=X` completo vía HTTP a `localhost` | **751ms**, payload 7,438,104 bytes |

Conclusión real: la query y el servidor están bien — el problema genuino es el TAMAÑO del
payload (7.4MB para una sola llamada), no una query rota ni un N+1. Eso sigue siendo un problema
real para el caso de uso (staff escaneando desde el celular con wifi/datos de un evento), solo
que la severidad reportada arriba (15-20s, "colgado") estaba inflada por la red local de esta
sesión, no reflejaba el comportamiento real del servidor.

## Fix aplicado y verificado

`api/src/routes/sale-tickets.ts`: nuevo `listInclude` para el handler `GET /` — se auditó con
grep exhaustivo contra `qrs`, `event-details` y `dash-board` qué campos de `event`/`seat`/
`ticket`/`client`/`seller` lee realmente el frontend antes de tocar nada. Hallazgo: `seller` no
se lee en NINGÚN lado (queda declarado en el modelo TS pero muerto); `client.email` sí se usa
(el modal de detalle recibe la fila tal cual, sin volver a pedirla). `saleTicketInclude`/
`toPublicSaleTicket` (usados por `scan.ts` y el resto de los endpoints de este archivo) quedan
sin tocar — el recorte es solo para la lista.

Verificado post-deploy, mismo método (dentro del contenedor, sin red local):

| Medición | Antes | Después |
|---|---|---|
| Bytes | 7,438,104 | **2,390,842** (-68%) |
| Tiempo | 751ms | **456ms** |

Confirmado que la fila sigue trayendo `event.name`, `seat.name`, `seat.area.name`, `ticket.name`,
`ticket.price`, `client.{id,name,lastname,carnet,email}` — y que `seller` ya no aparece.

Repetido el escenario de k6 desde la máquina local: mejoró (33% de fallos → 13%), pero no llegó a
cero — con la causa server-side ya descartada por la medición interna, lo que queda es la misma
inestabilidad de red local que afectó otras partes de la sesión, agravada acá porque el escenario
pide 15 VUs × 3 requests × ~2.4MB en simultáneo. No se siguió optimizando el payload a ciegas
persiguiendo un número medido con una red poco confiable de por medio.
