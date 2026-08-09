# resilience — 2026-08-09

Escenario: 20 VUs sostenidos por 3 minutos contra `GET /sale-tickets?eventId=X`
(`scenarios/resilience.js`), forzando un restart real de `seat-app-load-test` mientras la carga
está en curso — el objetivo es confirmar que el servicio se recupera solo, sin intervención
manual, y acotar cuánto dura la ventana de error real de un restart.

## Metodología: 3 intentos, los dos primeros descartados honestamente

**Intento 1**: se programó disparar el redeploy a mitad de la corrida vía `ScheduleWakeup` (75s
de delay contra una corrida de 180s). El wakeup perdió la carrera contra el propio `k6` — la
corrida terminó completa antes de que el redeploy se disparara. Encima, el token JWT del fixture
había expirado (8h de vida, sesión larga) — el 100% de los requests devolvió 401. Descartado, no
se documenta como resultado real.

**Intento 2**: token refrescado, mismo mecanismo de `ScheduleWakeup` a 75s. Perdió la carrera de
nuevo — la corrida terminó sin que el redeploy llegara a dispararse. Sí mostró degradación real
(94.96% éxito, latencia promedio 26.79s) pero sin ningún restart de por medio — coincide con el
mismo patrón de saturación de red local visto en `dashboard-polling`/`stress-ramp` (20 VUs ×
~2.4MB cada uno, más de lo que esta conexión puede sostener). Descartado como prueba de
resiliencia a restart — no hay restart que atribuirle el resultado.

**Intento 3 (el que cuenta)**: en vez de competir contra el timing fijo de k6, se disparó el
redeploy PRIMERO (`mcp__railway__deploy`, deployment `0b058d09`) y se arrancó `k6` inmediatamente
después, sin esperar — así la carga arranca solapada con la ventana real de restart en vez de
depender de acertarle a la mitad de una corrida ya en curso.

## Resultado (intento 3)

- `checks_succeeded` = 100% (134/134) en el check `responde (no timeout)` — el servicio NUNCA
  dejó de responder por completo (nunca status 0)
- `http_req_failed` = 2.98% (4 de 134) — la única señal de la corrida que podría corresponder a
  la ventana real del restart (el resto de las corridas de esta sesión, sin restart de por
  medio, dieron 0% en este mismo check)
- El deploy `0b058d09` terminó en `SUCCESS` (confirmado vía `environment_status` post-corrida) —
  el servicio volvió a responder solo, sin ninguna intervención manual más allá de la corrida en
  sí
- Latencia elevada en general (avg 27.63s, `data_received` 313MB para 134 requests, ~2.3MB/req)
  — consistente con el mismo cuello de botella de ancho de banda local documentado en
  `dashboard-polling.md`/`stress-ramp.md`, no algo nuevo de este escenario

## Qué prueba esto y qué no

**Sí prueba**: un restart real de `seat-app-load-test` (redeploy completo, no solo un reinicio de
proceso) no dejó el servicio caído — recuperó solo, y el 97% de los requests durante la ventana
de la corrida se sirvieron igual. No hace falta ningún paso manual de recuperación.

**No prueba con precisión**: no se puede aislar con certeza SI los 4 fallos (2.98%) ocurrieron
específicamente durante los segundos de corte del contenedor viejo/arranque del nuevo, o si son
parte del mismo ruido de red local que afecta todas las corridas de esta sesión — k6 no logueó
timestamp por request en esta corrida. Para una medición más precisa (aislar la ventana exacta de
downtime en segundos) hace falta correr esto desde una máquina con red confiable (mismo
prerrequisito ya señalado en `stress-ramp.md` para las pruebas de alta concurrencia).

## Conclusión de Fase 2

Con esto se cierran los 5 escenarios planeados. El sistema tolera restarts reales sin caerse
del todo — la severidad de cualquier ventana de error de restart, si existe, es baja (≤3% en esta
medición) y se recupera sin intervención manual.
