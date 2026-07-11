import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { Seat } from '../../../../models/maps/seat';
import { Area } from '../../../../models/maps/area';
import { Ticket } from '../../../../models/tickets/ticket';
import { User } from '../../../../models/users/user';
import { environment } from '../../../../../environments/environment';

export type SaleTicket = {
	id: number;
	status: number;
	active: boolean;
	description: string;
	dateSold: string;
	paidType: string;
	codeQR: string;
	checkedInAt: string | null;
	eventId: number;
	seatId: number;
	ticketId: number;
	clientId: number;
	event: Events;
	seat: Seat & { area: Area };
	ticket: Ticket;
	client: User;
	seller: User;
};

export type SaleTicketInput = {
	eventId: number;
	seatId: number;
	ticketId: number;
	clientId: number;
	paidType: string;
	description?: string;
};

@Injectable({
	providedIn: 'root',
})
export class QRService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/sale-tickets`;

	getQRs(): Observable<SaleTicket[]> {
		return this.httpClient.get<SaleTicket[]>(this.baseUrl);
	}

	getQRsByEvent(eventId: number): Observable<SaleTicket[]> {
		return this.httpClient.get<SaleTicket[]>(this.baseUrl, { params: { eventId } });
	}

	createQR(saleTicket: SaleTicketInput): Observable<SaleTicket> {
		return this.httpClient.post<SaleTicket>(this.baseUrl, saleTicket);
	}

	deleteQR(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}

	resendQR(id: number): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/${id}/resend`, {});
	}
}
