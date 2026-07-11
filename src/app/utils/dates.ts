// Las fechas de evento llegan de la API como instantes UTC medianoche que representan un día
// calendario (ej. "2026-07-15T00:00:00Z" = 15 de julio), no un momento puntual. Leerlas con
// getters locales (.getDate(), etc.) corre el riesgo de un día de diferencia en timezones detrás
// de UTC (ej. UTC-4), por eso siempre se leen con los getters UTC. "Hoy" en cambio es un instante
// real y se lee en hora local del usuario.
export function eventDateKey(date: Date): number {
	return date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
}

export function todayKey(): number {
	const now = new Date();
	return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}
