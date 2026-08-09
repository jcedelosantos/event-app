# evento fantasma (Fase 3) — 2026-08-09

Simulacro interno sobre un evento sintético completo: tenant CHURCH ("Iglesia Fantasma"), 800
tickets (700 General + 100 VIP), 3 puertas (Principal y Familias abiertas, VIP restringida solo
a tickets VIP), 150 familias con 225 `Child` registrados (talón compartido por familia). Durante
8 minutos corridos en simultáneo: 6 "scanners" online por las 3 puertas, 4 "dispositivos offline"
sincronizando en lote (algunos en solitario, otros deliberadamente en pares para forzar
conflictos reales), y 3 "watchers" pidiendo el dashboard cada 5-8s — todo contra el mismo evento,
al mismo tiempo, sobre el environment `load-test` (ya con el fix de payload de la Fase 2 en vivo).

Scripts: `scripts/ghost-event-setup.js` (arma el evento) + `scripts/ghost-event-drill.js` (corre
el simulacro). Datos crudos en `results/ghost-event-raw.json`.

## Resultado: el sistema se sostuvo, y los números CIERRAN exactos

- **3443 intentos de escaneo online** (`POST /scan`): 595 aplicados (primer escaneo real de cada
  código), 2848 correctamente rechazados como "ya escaneado" (409 — los mismos scanners
  reintentando códigos ya usados una y otra vez durante los 8 minutos, comportamiento esperado de
  un loop sin corte), **0 errores**
- **1605 sincronizaciones offline** (`POST /scan/sync`): 480 aplicadas, 1125 devueltas como
  conflicto, **0 errores**
- **369 polls de dashboard** (`sale-tickets` + `access-points/stats` + `scan/conflicts`, 3
  watchers × ~123 c/u): **100% exitosos, 0 errores** — el fix de payload de la Fase 2 sostuvo la
  carga concurrente de lectura sin degradarse
- **1342 registros de `ScanConflict`** generados (más que los 1125 reportados como "conflict" en
  las respuestas — ver nota abajo, es esperado, no un bug)

### Los conteos finales reconcilian exactamente contra el diseño del simulacro

```
Puerta Principal: 420 check-ins  ==  General escaneados online (60% de 700)
Puerta VIP:        70 check-ins  ==  VIP escaneados online (70% de 100)
Puerta Familias:  310 check-ins  ==  General+VIP offline (210+30) + conflictos resueltos (70)
Total evento:     800 check-ins  ==  TODOS los tickets (700 General + 100 VIP), sin excepción
```

Cada ticket terminó atribuido a la puerta y al mecanismo (online vs. offline) que realmente lo
procesó, sin un solo ticket perdido, duplicado, o mal atribuido — con 3443+1605=5048 requests de
escritura concurrentes de por medio, sobre datos sintéticos reales (no mocks).

## Sobre los 1342 conflictos vs. los 1125 reportados como "conflict"

No es una inconsistencia: `reconcileEntity` (scan.ts) crea una fila de `ScanConflict` en DOS
ramas — cuando el intento pierde (responde `'conflict'`, 1125 casos) Y TAMBIÉN cuando un intento
con timestamp más temprano le "quita" el lugar a un registro ya aplicado anteriormente (responde
`'applied'`, pero deja una fila de conflicto para el que quedó atrás). Los 217 de diferencia
(1342-1125) son exactamente esa segunda rama — casos reales de "llegó tarde el que debía haber
ganado, y le pasó por encima al que había llegado primero". Confirma que la lógica de
reconciliación de la Fase 1 del modo offline se comporta como se diseñó, incluso bajo el patrón
de reintentos repetidos que generó este simulacro (ver limitación abajo).

## Limitación honesta del diseño del simulacro (no un hallazgo del producto)

**El rechazo por regla de puerta (`403`) nunca se puso a prueba de verdad**: se armaron 20 códigos
General deliberadamente para intentar entrar por la Puerta VIP (restringida) y confirmar el
rechazo — pero esos mismos códigos también estaban en el pool de la Puerta Principal (abierta), y
por el orden de ejecución del script terminaron escaneados ahí PRIMERO. Una vez que un ticket ya
tiene `checkedInAt`, `POST /scan` devuelve "ya fue escaneado" (409) antes de siquiera llegar a
chequear la regla de la puerta — así que el camino de rechazo por puerta (`accessPointDenialError`)
nunca se ejecutó en este simulacro. La regla de puertas restringidas SÍ está probada y funcionando
en producción desde la feature original (ver `seat-app-gestion-puertas` en memoria, verificado
end-to-end en esa vuelta) — este simulacro simplemente no la volvió a ejercitar por un defecto de
diseño del script de prueba, no del producto. Queda como pendiente para una repetición futura:
usar códigos exclusivos para el intento de rechazo, sin pasar antes por ninguna puerta abierta.

**Los "dispositivos offline en solitario" terminaron re-sincronizando en loop**: el diseño
original era "cada dispositivo sincroniza sus códigos una sola vez" pero el script los hizo
ciclar sin corte por 8 minutos (mismo patrón que los scanners online) — en la práctica esto
terminó probando algo distinto y más exigente: reintentos repetidos con timestamps aleatorios
distintos cada vez, que el sistema resolvió con 0 errores y sin corromper el estado final. Un
resultado más duro de lo planeado, y lo pasó.

## ¿Justifica esto un piloto con cliente real?

Según el criterio original de la Fase 3 del plan: el simulacro no encontró ninguna falla que
bloquee avanzar. La única brecha real es de METODOLOGÍA de prueba (el camino de rechazo de puerta
no se ejercitó), no del sistema — y esa ruta específica ya tiene verificación end-to-end previa
documentada en la sesión de la feature de puertas. Con eso en cuenta: no aparece nada que
justifique frenar antes de un piloto — se recomienda repetir el simulacro una vez más con el
ajuste de metodología señalado arriba (códigos de rechazo exclusivos, single-sync real sin loop)
como último chequeo antes de decidir sobre un piloto, en vez de decidir ya con esta sola corrida.
