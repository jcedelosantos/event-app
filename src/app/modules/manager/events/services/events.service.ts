import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { environment } from '../../../../../environments/environment';

export type EventInput = {
	name: string;
	img?: string;
	code?: string;
	type: string;
	description?: string;
	dateSale?: string | Date;
	dateOn: string | Date;
	dateOff?: string | Date;
	startTime?: string;
	active?: boolean;
	mapId?: number | null;
	hostName?: string | null;
	maxHostGuests?: number | null;
	// Solo se usa al editar (ver PUT /events/:id) — número para vincular con ese evento, null para
	// desvincular, ausente/undefined para no tocar el vínculo actual.
	linkedEventId?: number | null;
	// Fecha/hora de publicación en el portal público — null = sin restricción, visible ya mismo.
	publishAt?: string | Date | null;
	// Sala de espera virtual del picker público — false por defecto.
	waitingRoomEnabled?: boolean;
	waitingRoomBatchSize?: number | null;
};

export type WaitingRoomStats = { queueCount: number; admittedCount: number };

@Injectable({
	providedIn: 'root',
})
export class EventsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/events`;

	getEvents(): Observable<Events[]> {
		return this.httpClient.get<Events[]>(this.baseUrl).pipe(map((events) => events.map(reviveDates)));
	}

	// Cuánta gente hay ahora mismo en la fila/admitida (ver lib/waiting-room.ts) — solo tiene sentido
	// pollearlo mientras el evento tiene waitingRoomEnabled prendido (ver event-card.component.ts).
	getWaitingRoomStats(id: number): Observable<WaitingRoomStats> {
		return this.httpClient.get<WaitingRoomStats>(`${this.baseUrl}/${id}/waiting-room/stats`);
	}

	getEvent(id: number): Observable<Events> {
		return this.httpClient.get<Events>(`${this.baseUrl}/${id}`).pipe(map(reviveDates));
	}

	createEvent(event: EventInput): Observable<Events> {
		return this.httpClient.post<Events>(this.baseUrl, event).pipe(map(reviveDates));
	}

	updateEvent(id: number, event: Partial<EventInput>): Observable<Events> {
		return this.httpClient.put<Events>(`${this.baseUrl}/${id}`, event).pipe(map(reviveDates));
	}

	deleteEvent(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}

// La API devuelve fechas como strings ISO (JSON no tiene tipo Date); los templates llaman .toISOString() sobre ellas.
function reviveDates(event: Events): Events {
	return {
		...event,
		dateSale: new Date(event.dateSale),
		dateOn: new Date(event.dateOn),
		dateOff: new Date(event.dateOff),
		publishAt: event.publishAt ? new Date(event.publishAt) : null,
	};
}
