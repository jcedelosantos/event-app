// República Dominicana, AST fijo todo el año (sin horario de verano) — mismo offset que ya usaba
// scan.ts para el check-in, ahora compartido acá para reusarlo también en el cierre de ventas.
const CLUB_UTC_OFFSET_HOURS = 4;

// dateOn es el día calendario del evento (medianoche UTC, ver utils/dates.ts). El horario real de
// inicio vive aparte en startTime ("HH:mm", hora local del club) porque mezclar hora-de-reloj
// dentro de dateOn rompería la lógica de "día calendario" que usa el resto de la app (dashboard,
// calendario). Si el evento no tiene startTime cargado (eventos viejos, campo opcional), no hay
// forma de saber la hora real de inicio.
export function eventStartInstant(eventDateOn: Date, startTime: string | null): Date | null {
	if (!startTime) return null;
	const [hours, minutes] = startTime.split(':').map(Number);
	return new Date(
		Date.UTC(eventDateOn.getUTCFullYear(), eventDateOn.getUTCMonth(), eventDateOn.getUTCDate(), hours + CLUB_UTC_OFFSET_HOURS, minutes),
	);
}

const MIN_SALES_WINDOW_AFTER_START_HOURS = 2;

// Las ventas nunca cierran antes de esto, sin importar qué diga Event.dateOff — muchos compradores
// pagan en la puerta el mismo día. Cuando el manager no carga "Fecha fin" (opcional, ver
// create-event-modal), dateOff queda igual a dateOn (ver routes/events.ts), es decir medianoche del
// día del evento — sin este piso, las ventas cerraban horas antes de que el evento siquiera
// arrancara. Si dateOff SÍ quedó puesto más adelante a propósito (ej. un festival de varios días),
// ese valor manda igual — esto es un piso, no un techo.
export function effectiveSalesCloseAt(event: { dateOn: Date; dateOff: Date; startTime: string | null }): Date {
	const startsAt = eventStartInstant(event.dateOn, event.startTime);
	if (!startsAt) return event.dateOff;
	const minCloseAt = new Date(startsAt.getTime() + MIN_SALES_WINDOW_AFTER_START_HOURS * 60 * 60 * 1000);
	return event.dateOff > minCloseAt ? event.dateOff : minCloseAt;
}
