# Modelo de costo real (Fase 4) — 2026-08-09

Objetivo: cruzar el uso REAL de recursos medido en las Fases 2 y 3 contra el precio real de
Railway (`docs.railway.com/pricing`), para saber si los precios actuales de los 4 planes
(`api/src/lib/plans.ts`) tienen margen o están ajustados contra el costo de infraestructura.

## Precio real de Railway (fuente: docs oficiales, no supuesto)

Plan actual del proyecto: **Hobby** ($5/mes, incluye $5 de uso — si el uso real es menor a $5,
solo se cobra la suscripción).

| Recurso | Precio |
|---|---|
| RAM | $10 / GB / mes ($0.000231 / GB / minuto) |
| CPU | $20 / vCPU / mes ($0.000463 / vCPU / minuto) |
| Red saliente (egress) | $0.05 / GB |
| Almacenamiento (volumen) | $0.15 / GB / mes |

## Costo real en reposo (los 5 tenants actuales, ventana de 72h en producción)

| Servicio | CPU promedio | RAM promedio | Disco |
|---|---|---|---|
| `seat-app` (API) | 0.03% vCPU | 75.5 MB | 80 MB |
| `Postgres` | 0.01% vCPU | 58.5 MB | 98 MB |

Costo mensual de cómputo en reposo: (0.0003+0.0001) vCPU × $20 + (0.0755+0.0585) GB × $10 ≈
**$1.35/mes**. Volúmenes: ~0.18GB × $0.15 ≈ **$0.03/mes**. Red: prácticamente cero (tráfico real
de 5 tenants en un día normal es mínimo). **Total: ~$1.4/mes** — muy por debajo del crédito
incluido en el plan Hobby ($5). Hoy Railway cobra exactamente $5/mes, sin excedente, sin importar
que hoy sean 5 tenants o si fueran 20 con este mismo patrón de uso.

## Costo real de UN evento grande (medido con datos reales de la Fase 3, no supuesto)

Durante el simulacro "evento fantasma" (800 tickets, 3 puertas, 8 minutos de carga sostenida
combinando escaneo online, sync offline y 3 watchers de dashboard con el mismo intervalo de
polling que usa la app real — `LIVE_REFRESH_MS`), el servicio de staging midió:

- CPU promedio 3.46% vCPU (pico 32.62%)
- RAM promedio 244.6 MB (pico 625.9 MB)
- ~332MB transferidos en 8 minutos, casi todo por el polling del dashboard (confirmado además
  por la corrida de `resilience.js`: 313MB en 3m25s, mismo orden de magnitud — no es un outlier)

**El costo de cómputo de un evento es irrelevante** (fracciones de centavo): a esta tasa,
3 horas de evento cuestan ≈$0.003 (CPU) + $0.01 (RAM) ≈ **$0.013**.

**El costo real que sí importa es el egress del polling del dashboard** — y es exactamente el
problema que ya se corrigió en la Fase 2 (payload de `GET /sale-tickets` de 7.4MB a 2.4MB, -68%).
Con el payload YA corregido: normalizando el dato medido (332MB / 800 asistentes / 3 watchers /
8 min) a $/asistente-watcher-minuto, un evento de **150 asistentes, 2 pantallas de dashboard
abiertas, 2 horas de duración** (perfil típico de un tenant Intermedio) cuesta
**≈$0.03 de egress**. Un evento de 1000 asistentes con 4 pantallas por 4 horas (techo del plan
Pro Max) cuesta **≈$0.55**. Sin el fix de la Fase 2, estos números serían ~3x más altos.

## Proyección a escala (100 y 500 tenants)

Supuesto conservador: 2 eventos/tenant/mes, mezcla realista de tamaños de evento (repartidos
entre los 4 planes). Sumando cómputo en reposo (crece muy poco con más tenants — Postgres y
Express comparten instancia, ya estresado hasta 25 tenants concurrentes en la Fase 2 sin
degradación) + egress de eventos activos:

| Escala | Cómputo en reposo | Egress de eventos (2/tenant/mes) | Total infra/mes | Ingreso mínimo (100% Básico, $19) |
|---|---|---|---|---|
| 5 tenants (hoy) | ~$1.4 | ~$0.3 | **~$1.7/mes** | $95/mes |
| 100 tenants | ~$3-5 (estimado, no medido directo) | ~$7 | **~$10-12/mes** | $1,900/mes |
| 500 tenants | ~$10-15 (estimado) | ~$35 | **~$45-50/mes** | $9,500/mes |

Los números de "cómputo en reposo" a 100/500 tenants son extrapolación razonada, no medición
directa — la Fase 2 sí midió 25 tenants concurrentes escaneando a la vez sin degradación, lo cual
da confianza en que la instancia actual escala bien más allá de 25, pero confirmar el techo real
a 100-500 tenants simultáneos activos requeriría repetir el escenario `multi-tenant.js` con más
tenants (fuera de alcance de esta vuelta).

## Otras variables (fuera de Railway, no medidas directamente esta vuelta)

No hay acceso de facturación a estas cuentas desde esta sesión — se documentan con el modelo de
precio público conocido, a confirmar con las cuentas reales antes de usarlas para fijar precios:

- **Resend** (envío de QR por correo): tier gratuito hasta 3,000 correos/mes; plan pago desde
  $20/mes para 50,000. Un tenant que vende 150 tickets = 150 correos (+reenvíos). A 100 tenants
  con 2 eventos/mes de ~150 personas, eso son ~30,000 correos/mes — probablemente exige el plan
  pago de Resend (~$20/mes total para TODA la plataforma, no por tenant).
- **Backup a S3** (Tigris, `t3.storageapi.dev`, ver `seat-app-postgres-migration` en memoria):
  precio típico de este proveedor ronda $0.02-0.024/GB/mes de almacenamiento con egress
  gratuito — con una base de datos todavía chica (decenas de MB), esto es centavos por mes.
  Crece con el volumen total de datos de la plataforma, no por tenant activo.
- **WhatsApp/Meta Business API** (automatización de creación de eventos, ver
  `seat-app-whatsapp-automation` en memoria): cobra por conversación, variable por categoría y
  país (típicamente $0.01-$0.10/conversación) — es la variable más impredecible de las tres
  porque depende del volumen real de eventos creados por foto de flyer, que no se midió en esta
  sesión. Recomendación: revisar el volumen real de conversaciones en el Business Manager de
  Meta antes de asumir cualquier número acá.

Ninguna de las tres, a esta escala, parece capaz de acercarse al precio de un solo plan Básico
($19/mes) por sí sola — pero WhatsApp es la única con upside real de costo si el volumen de
automatización crece mucho más que el resto.

## Conclusión para la Fase 5

**El costo de infraestructura no es una restricción real para los precios actuales.** Incluso en
el escenario de 500 tenants con proyecciones generosas, el costo total de Railway
(~$45-50/mes) es una fracción mínima de un solo mes de ingresos del plan más barato con 100
tenants ($1,900/mes) — y ni hablar de 500. El margen bruto sobre infraestructura, a cualquier
escala considerada en este plan (100-500 clientes), es superior al 99%.

Esto tiene una implicación directa y honesta para la Fase 5: **subir precios por "costos reales
de Railway" no tiene fundamento con estos números** — el costo de infraestructura no explica ni
justifica un ajuste al alza. Si hay una razón real para tocar los precios, tiene que venir de
otro lado (valor percibido, diferenciación de features entre planes, benchmarking contra
competencia, o el costo variable de WhatsApp si su volumen crece) — no de unit economics de
cómputo, que hoy sobran.

## Validación a 60 tenants concurrentes (post-Fase 4)

La proyección de arriba marcaba el cómputo a 100/500 tenants como "extrapolación razonada, no
medición directa". Para reforzarla con datos reales, se generaron 60 tenants concurrentes
(2.4x los 25 de la Fase 2) en `load-test` y se repitió `multi-tenant.js` (40 VUs, misma
concurrencia que la corrida original de 25 tenants).

**Resultado**: p(95) = 346.54ms, 0% de errores, 0 fugas entre tenants — igual de saludable que
con 25 tenants (312-550ms según la corrida). 16,488 checks, 100% en verde.

**CPU/memoria durante esta ventana**: promedio 3.87% vCPU / 181MB RAM, con un pico puntual de
101% vCPU. Ese pico coincide con la ventana en la que también corrió el script de siembra de los
60 tenants (creación secuencial de tenant+mapa+evento+tickets vía HTTP) justo antes del test de
k6 — no es una medición limpia de "60 tenants en estado estable bajo carga", sino esa carga
mezclada con la siembra. Se documenta así, sin filtrarlo, aunque complica la comparación directa
contra los promedios más bajos de la Fase 2.

**Conclusión honesta**: la señal más confiable de esta validación es la latencia/tasa de error
bajo carga real (que se mantuvo idéntica de 25 a 60 tenants), no el promedio de CPU de la ventana
(contaminado por la siembra). Confirma la premisa central del modelo — la cantidad de tenants
*dormidos* en la base no es lo que consume recursos, es la tasa de requests concurrentes activos,
que en esta prueba se mantuvo igual (40 VUs) independientemente de si había 25 o 60 tenants
detrás. La proyección a 100/500 tenants sigue pareciendo razonable. Para una validación
completamente limpia de CPU en estado estable (sin la siembra de por medio) haría falta repetir
esto con los tenants ya sembrados de antemano y una pausa entre siembra y medición — queda como
mejora de metodología para una vuelta futura, no como algo que cambie la conclusión de este
informe.

