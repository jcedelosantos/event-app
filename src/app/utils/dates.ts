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

// República Dominicana, AST fijo todo el año (sin horario de verano) — mismo offset que usa la API
// (ver api/src/lib/event-time.ts) para convertir dateOn (día calendario, medianoche UTC) + startTime
// ("HH:mm", hora local del club) al instante real de inicio del evento.
const CLUB_UTC_OFFSET_HOURS = 4;

export function eventStartInstant(eventDateOn: Date, startTime: string | null): Date | null {
	if (!startTime) return null;
	const [hours, minutes] = startTime.split(':').map(Number);
	return new Date(
		Date.UTC(eventDateOn.getUTCFullYear(), eventDateOn.getUTCMonth(), eventDateOn.getUTCDate(), hours + CLUB_UTC_OFFSET_HOURS, minutes),
	);
}

const MIN_SALES_WINDOW_AFTER_START_HOURS = 2;

// Las ventas nunca cierran antes de esto, sin importar qué diga dateOff — mismo criterio que la API
// (ver effectiveSalesCloseAt en api/src/lib/event-time.ts), replicado acá porque el gate real de
// compra vive en ambos lados (éste es el mensaje que ve el comprador, el de la API es el que de
// verdad bloquea el checkout).
export function effectiveSalesCloseAt(event: { dateOn: Date | string; dateOff: Date | string; startTime: string | null }): Date {
	const dateOn = new Date(event.dateOn);
	const dateOff = new Date(event.dateOff);
	const startsAt = eventStartInstant(dateOn, event.startTime);
	if (!startsAt) return dateOff;
	const minCloseAt = new Date(startsAt.getTime() + MIN_SALES_WINDOW_AFTER_START_HOURS * 60 * 60 * 1000);
	return dateOff > minCloseAt ? dateOff : minCloseAt;
}
