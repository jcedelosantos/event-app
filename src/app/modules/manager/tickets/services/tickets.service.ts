import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Ticket } from '../../../../models/tickets/ticket';
import { faker } from '@faker-js/faker';
import { environment } from '../../../../../environments/environment';

export type TicketInput = {
	name: string;
	code?: string;
	img?: string;
	description?: string;
	type: string;
	count: number;
	active?: boolean;
	price: number;
	eventId: number;
};

@Injectable({
	providedIn: 'root',
})
export class TicketsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/tickets`;

	// Usado únicamente por módulos que aún no se conectan a la API (QRs, Sales — pendiente).
	mockTickets() {
		return {
			id: faker.number.int({ min: 1, max: 100 }),
			img: faker.image.urlPicsumPhotos(),
			code: faker.string.uuid(),
			name: faker.commerce.productName(),
			description: faker.commerce.productDescription(),
			type: faker.helpers.arrayElement(['Normal', 'VIP']),
			count: faker.number.int({ min: 1, max: 100 }),
			active: faker.helpers.arrayElement([true, false]),
			price: Number(faker.commerce.price()),
			eventId: 0,
		} as Ticket;
	}

	getTickets(): Observable<Ticket[]> {
		return this.httpClient.get<Ticket[]>(this.baseUrl);
	}

	createTicket(ticket: TicketInput): Observable<Ticket> {
		return this.httpClient.post<Ticket>(this.baseUrl, ticket);
	}

	updateTicket(id: number, ticket: Partial<TicketInput>): Observable<Ticket> {
		return this.httpClient.put<Ticket>(`${this.baseUrl}/${id}`, ticket);
	}

	deleteTicket(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
