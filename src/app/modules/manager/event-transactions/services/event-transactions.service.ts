import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EventTransaction, EventTransactionType } from '../../../../models/event-transactions/event-transaction';
import { environment } from '../../../../../environments/environment';

export type EventTransactionInput = {
	type: EventTransactionType;
	category: string;
	description?: string;
	amountCents: number;
	eventId: number;
};

@Injectable({
	providedIn: 'root',
})
export class EventTransactionsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/event-transactions`;

	getByEvent(eventId: number): Observable<EventTransaction[]> {
		return this.httpClient.get<EventTransaction[]>(this.baseUrl, { params: { eventId } });
	}

	// Todas las líneas del tenant, de cualquier evento — usado por el Dashboard para el agregado de
	// gasto promedio/margen (ver dash-board.component.ts).
	getAll(): Observable<EventTransaction[]> {
		return this.httpClient.get<EventTransaction[]>(this.baseUrl);
	}

	create(input: EventTransactionInput): Observable<EventTransaction> {
		return this.httpClient.post<EventTransaction>(this.baseUrl, input);
	}

	update(id: number, input: Partial<EventTransactionInput>): Observable<EventTransaction> {
		return this.httpClient.put<EventTransaction>(`${this.baseUrl}/${id}`, input);
	}

	delete(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
