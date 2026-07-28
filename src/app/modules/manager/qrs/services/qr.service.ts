import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { Seat } from '../../../../models/maps/seat';
import { Area } from '../../../../models/maps/area';
import { Ticket } from '../../../../models/tickets/ticket';
import { User } from '../../../../models/users/user';
import { environment } from '../../../../../environments/environment';

export type AttendeeType = 'SOCIO' | 'INVITADO';

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
	// Solo relevantes en tenants tipo CLUB — ver models/tenants/tenant.ts.
	attendeeType: AttendeeType;
	sponsorCarnet: string | null;
	// Solo relevante en tenants tipo CHURCH — ver models/events/events.ts (hostName/maxHostGuests).
	isHostGuest: boolean;
	// PAID (default, incluye toda venta manual del manager) | PENDING — solo eventos con
	// Event.paymentMode ver reservas en PENDING mientras esperan que se confirme el pago (webhook de
	// PayPal o "Marcar como pagado" acá mismo, ver Opción "Link").
	paymentStatus: 'PAID' | 'PENDING';
	paymentProvider: 'PAYPAL' | 'LINK' | null;
	// MANUAL (venta cargada por un staff desde el manager) | PUBLIC (el comprador se autogestionó
	// desde el portal público) — ver columna "Origen" en el panel de QRs.
	channel: 'MANUAL' | 'PUBLIC';
};

export type SaleTicketInput = {
	eventId: number;
	seatId: number;
	ticketId: number;
	clientId: number;
	paidType: string;
	description?: string;
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
	isHostGuest?: boolean;
};

export type BulkImportSaleTicketRow = {
	carnet: string;
	name: string;
	lastname: string;
	email: string;
	phone: string;
	seatName: string;
	paidType: string;
};

export type BulkImportSaleTicketsInput = {
	eventId: number;
	ticketId: number;
	rows: BulkImportSaleTicketRow[];
};

export type BulkImportResult = {
	created: number;
	skipped: { row: number; reason: string }[];
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

	// Corrección manual del estado (checkbox en la columna Estado) — no reemplaza el check-in real
	// por QR (POST /scan), es para cuando alguien ya entró sin escanear o hay que revertir un error.
	setCheckedIn(id: number, checkedIn: boolean): Observable<SaleTicket> {
		return this.httpClient.put<SaleTicket>(`${this.baseUrl}/${id}/check-in`, { checkedIn });
	}

	// Confirmación manual de pago (Opción "Link") — una venta a la vez, con la forma de pago real (no
	// el "Link de pago" genérico que quedó guardado al reservar, ver sale-tickets.ts).
	markPaid(id: number, paidType: string): Observable<SaleTicket> {
		return this.httpClient.put<SaleTicket>(`${this.baseUrl}/${id}/mark-paid`, { paidType });
	}

	// Deshace un "Marcar como pagado" hecho por error — vuelve a Pendiente sin liberar el asiento.
	markPending(id: number): Observable<SaleTicket> {
		return this.httpClient.put<SaleTicket>(`${this.baseUrl}/${id}/mark-pending`, {});
	}

	bulkImport(input: BulkImportSaleTicketsInput): Observable<BulkImportResult> {
		return this.httpClient.post<BulkImportResult>(`${this.baseUrl}/bulk-import`, input);
	}
}
