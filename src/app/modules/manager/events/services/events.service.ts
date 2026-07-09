import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { faker } from '@faker-js/faker';
import { environment } from '../../../../../environments/environment';

import { maps } from '../../../../data/map';
import { tickets } from '../../../../data/tickets';

export type EventInput = {
	name: string;
	img?: string;
	code?: string;
	type: string;
	description?: string;
	dateSale?: string | Date;
	dateOn: string | Date;
	dateOff?: string | Date;
	active?: boolean;
	mapId?: number;
};

@Injectable({
	providedIn: 'root',
})
export class EventsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/events`;

	// Usado únicamente por módulos que aún no se conectan a la API (QRs, Sales — Fase 3 pendiente).
	mockEvents() {
		return {
			id: faker.number.int({ min: 1, max: 100 }),
			userId: faker.number.int({ min: 1, max: 100 }),
			name: faker.commerce.productName(),
			img: faker.image.urlPicsumPhotos(),
			code: faker.string.uuid(),
			type: faker.helpers.arrayElement(['Normal', 'VIP']),
			description: faker.commerce.productDescription(),
			dateSale: faker.date.anytime(),
			dateOn: faker.date.anytime(),
			dateOff: faker.date.anytime(),
			active: faker.helpers.arrayElement([true, false]),
			map: maps[0],
			tickets: tickets,
			catalogs: [],
		} as Events;
	}

	createRandomEvent(): Events {
		return this.mockEvents();
	}

	getEvents(): Observable<Events[]> {
		return this.httpClient.get<Events[]>(this.baseUrl).pipe(map((events) => events.map(reviveDates)));
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
	};
}
