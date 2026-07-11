import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Ticket } from '../../../../models/tickets/ticket';
import { environment } from '../../../../../environments/environment';

export type TicketInput = {
	name: string;
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

	getTickets(): Observable<Ticket[]> {
		return this.httpClient.get<Ticket[]>(this.baseUrl);
	}

	getTicketsByEvent(eventId: number): Observable<Ticket[]> {
		return this.httpClient.get<Ticket[]>(this.baseUrl, { params: { eventId } });
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
