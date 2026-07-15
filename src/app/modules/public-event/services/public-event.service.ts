import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type PublicSeat = {
	id: number;
	name: string;
	icon: string;
	x: number;
	y: number;
	size: number;
	color: string;
	available: boolean;
	tableId: number | null;
};

export type PublicTable = {
	id: number;
	name: string;
	icon: string;
	x: number;
	y: number;
	size: number;
	color: string;
};

export type PublicArea = {
	id: number;
	name: string;
	description: string;
	img: string;
	seats: PublicSeat[];
	tables: PublicTable[];
};

export type PublicMap = {
	id: number;
	name: string;
	areas: PublicArea[];
} | null;

export type PublicTicket = {
	id: number;
	name: string;
	type: string;
	price: number;
	description: string;
	areaId: number | null;
	count: number;
	// Solo viene seteado en tenants CLUB — el picker público lo usa para auto-elegir el ticket según
	// la respuesta a "¿Sos socio o invitado?" (ver public-event.component.ts).
	attendeeType: 'SOCIO' | 'INVITADO' | null;
};

export type TenantType = 'GENERAL' | 'CLUB' | 'CHURCH';

export type PublicEvent = {
	id: number;
	name: string;
	code: string;
	description: string;
	img: string;
	dateOn: string;
	dateOff: string;
	startTime: string | null;
	tickets: PublicTicket[];
	map: PublicMap;
	// Si es CLUB, hay que pedir socio/invitado + carnet al reservar (ver AttendeeType más abajo).
	tenantType: TenantType;
};

export type RegisterInput = { name: string; lastname: string; email: string; phone: string; carnet: string };

export type AttendeeType = 'SOCIO' | 'INVITADO';

export type PurchaseInput = {
	eventCode: string;
	ticketId: number;
	client: RegisterInput;
	seatIds: number[];
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
};

export type PurchasedSaleTicket = {
	id: number;
	codeQR: string;
	seat: { name: string; area: { name: string } };
	ticket: { name: string; type: string; price: number };
};

export type SponsorStatus = { used: number; max: number; blocked: boolean };

@Injectable({ providedIn: 'root' })
export class PublicEventService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public`;

	getEvent(code: string): Observable<PublicEvent> {
		return this.httpClient.get<PublicEvent>(`${this.baseUrl}/events/${code}`);
	}

	purchase(input: PurchaseInput): Observable<PurchasedSaleTicket[]> {
		return this.httpClient.post<PurchasedSaleTicket[]>(`${this.baseUrl}/purchase`, input);
	}

	// Chequea el tope de invitados de un socio ANTES de dejar elegir asiento — evita que un invitado
	// arme toda su selección para recién enterarse del rechazo al confirmar (ver public.ts).
	getSponsorStatus(code: string, carnet: string): Observable<SponsorStatus> {
		return this.httpClient.get<SponsorStatus>(`${this.baseUrl}/events/${code}/sponsor-status`, { params: { carnet } });
	}
}
