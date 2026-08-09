# multi-tenant — 2026-08-09

Escenario: 25 tenants distintos, cada uno con su propio evento y ~120 codeQRs reales, todos
escaneando en simultáneo (`scenarios/multi-tenant.js`, 40 VUs repartidos entre tenants,
rampa 10s→40, sostenido 40s, baja 10s). Environment `load-test`, Postgres propio.

## Corrida 1 (baseline, sin tocar `api/src/lib/prisma.ts`)

- `http_req_duration` p(95) = 550.71ms, p(99) = 1.07s — **no cumple** el umbral (p95<500ms)
- `http_req_failed` = 0.00% — 0 errores 5xx en 4933 requests
- Throughput: ~82 req/s

Comparado contra `scan-concurrency` (un solo tenant, 50 VUs, p95=424.61ms, 0% error): a
concurrencia similar, repartir la misma carga entre 25 tenants distintos es más lento que
concentrarla en uno solo, sin que aparezca ni un solo error. Hipótesis: el pool de conexiones de
Prisma (`new PrismaClient()` sin configurar, default `num_cpus*2+1`) se satura antes con
consultas de distintos tenants (que no comparten el mismo plan de query cacheado) que con el
mismo tenant repetido.

## Intento de fix: `connection_limit=20` explícito — EMPEORÓ, revertido

Se probó fijar `connection_limit=20` y `pool_timeout=20` en la URL de conexión de Prisma
(commit temporal en staging, nunca llegó a producción). Resultado en la misma corrida:

- `http_req_duration` p(95) = **32.11s**, p(99) = **34.78s**
- `http_req_failed` = 0.00% — igual que antes, CERO errores

Que la tasa de error se mantenga en 0% mientras la latencia se dispara 60x es la firma típica de
pedir más conexiones simultáneas de las que la instancia de Postgres puede otorgar
(`max_connections` del lado del servidor, no del cliente) — Prisma no falla rápido, encola/
reintenta el pedido de conexión hasta obtener una, y con `pool_timeout=20` ese reintento tarda
mucho más antes de rendirse (por eso tampoco se ve como error). Subir el pool del LADO DE LA
APP no ayuda si el techo real está del lado de Postgres.

**Revertido** a `new PrismaClient()` sin parámetros — commit revertido en staging, nunca se
desplegó a producción (la verificación in-staging es exactamente para evitar este tipo de
sorpresa en el servicio real de los 5 tenants).

## Pendiente (no bloqueante para seguir con Fase 2, sí antes de tocar el pool de nuevo)

Confirmar el `max_connections` real de la instancia de Postgres de Railway (`SHOW
max_connections;`) antes de volver a intentar cualquier ajuste de pool — sin ese dato cualquier
número que se fije es una adivinanza que puede repetir este mismo resultado. El intento de
diagnosticarlo vía `railway ssh` en esta sesión chocó con una falla de red intermitente hacia el
control plane de Railway (mismo tipo de blip visto durante el seed de fixtures) — hay que
reintentarlo en una sesión con mejor conectividad, no fue un callejón sin salida técnico.

## Confirmación post-revert

Redesplegado `new PrismaClient()` sin parámetros a staging y vuelto a correr el mismo
escenario: p(95) = 312.2ms, p(99) no cruzó el umbral, 0% error, 6068 iteraciones — mejor
incluso que la corrida 1 original (probablemente por warm-up de conexiones ya establecidas
del intento anterior). Confirma que el revert dejó el servicio sano.

## Conclusión de esta fase

El multi-tenant concurrente SÍ es más lento que el de un solo tenant a igual concurrencia, pero
sigue sin producir errores y su p95 (550ms) está lejos de ser inaceptable para la operación real
de un evento (el umbral de 500ms era una meta arbitraria del script, no un límite de negocio
documentado). Se deja como hallazgo documentado, no como bloqueante — production sigue sin
tocarse en este punto.
