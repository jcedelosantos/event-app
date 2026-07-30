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

// null = este evento no exige pago online (Event.paymentMode = NONE), el registro sigue siendo
// gratis como siempre. paypalClientId/linkUrl pueden venir null igual si el manager activó el modo
// pero todavía no cargó las credenciales en Settings → Pagos.
export type PublicEventPayment = {
	mode: 'PAYPAL' | 'LINK' | 'BOTH';
	paypalClientId: string | null;
	linkUrl: string | null;
};

export type PublicEvent = {
	id: number;
	name: string;
	code: string;
	description: string;
	img: string;
	dateOn: string;
	dateOff: string;
	startTime: string | null;
	// El evento es visible/consultable igual antes de esta fecha, pero no comprable (ver
	// purchaseBlockedReason en public-event.component.ts) — null = sin restricción.
	publishAt: string | null;
	tickets: PublicTicket[];
	map: PublicMap;
	// Si es CLUB, hay que pedir socio/invitado + carnet al reservar (ver AttendeeType más abajo).
	tenantType: TenantType;
	// Solo relevante en tenants CHURCH — habilita el checkbox "¿retira comida?" al registrar hijos.
	hasMealOfTheDay: boolean;
	payment: PublicEventPayment | null;
};

export type RegisterInput = { name: string; lastname: string; email: string; phone: string; carnet: string };

export type AttendeeType = 'SOCIO' | 'INVITADO';

// Solo se manda en tenants CHURCH — ver public-event.component.ts, sección "¿Venís con hijos?".
export type ChildDraftInput = { name: string; age?: number; wantsMeal?: boolean };

export type PurchaseInput = {
	eventCode: string;
	ticketId: number;
	client: RegisterInput;
	seatIds: number[];
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
	children?: ChildDraftInput[];
};

// Checkout con pago (ver Event.paymentMode) — sin `children`, a propósito: un evento con cobro
// online vende solo tickets/asientos en esta primera vuelta (ver public.ts /checkout/hold).
export type CheckoutHoldInput = {
	eventCode: string;
	ticketId: number;
	client: RegisterInput;
	seatIds: number[];
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
	provider: 'PAYPAL' | 'LINK';
};

export type CheckoutHoldResult = { holdIds: number[]; totalUSD: number; expiresAt: string };
export type PaypalOrderResult = { orderId: string };
// Sin `children` a propósito — el checkout con pago no soporta registro de hijos (ver
// CheckoutHoldInput / public.ts).
export type PaypalCaptureResult = { saleTickets: PurchasedSaleTicket[] };

export type PurchasedSaleTicket = {
	id: number;
	codeQR: string;
	seat: { name: string; area: { name: string } };
	ticket: { name: string; type: string; price: number };
};

export type PurchasedChild = { id: number; name: string; codeQR: string };

export type PurchaseResult = { saleTickets: PurchasedSaleTicket[]; children: PurchasedChild[] };

export type SponsorStatus = { registered: boolean; used: number; max: number; blocked: boolean };

export type DuplicateEventStatus = { blocked: boolean; reason: string | null };

// enabled:false = el evento no usa sala de espera (o ya no queda en cola) — el frontend sigue
// directo al picker. admitted:true + position:null = ya puede pasar. admitted:false + position = su
// lugar en la fila (1-based). Ver api/src/lib/waiting-room.ts para el diseño completo.
export type WaitingRoomResult = { enabled: boolean; admitted: boolean; position: number | null };

export type PublicOrgEvent = {
	id: number;
	name: string;
	code: string;
	img: string;
	description: string;
	dateOn: string;
	dateOff: string;
	startTime: string | null;
	// Se manda tal cual (no solo el booleano `scheduled`) para poder armar la fecha/hora exacta o un
	// conteo regresivo en el badge "Próximamente" (ver org-landing.component.ts).
	publishAt: string | null;
	map: { name: string } | null;
	// Calculados en el backend (ver GET /public/org/:slug) — la portada usa esto para deshabilitar la
	// tarjeta sin tener que exponer tickets/precios en este listado público. Son casos distintos:
	// inactive = todavía no tiene tickets cargados (evento a futuro sin terminar de configurar);
	// soldOut = sí tiene tickets, pero ya se vendieron todos; scheduled = Event.publishAt a futuro (el
	// evento queda visible en el listado, solo no es elegible hasta esa fecha).
	inactive: boolean;
	soldOut: boolean;
	scheduled: boolean;
};

// Portada pública de una organización — lista sus próximos eventos activos (ver org-landing).
export type PublicOrg = {
	name: string;
	slug: string;
	type: TenantType;
	events: PublicOrgEvent[];
};

@Injectable({ providedIn: 'root' })
export class PublicEventService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public`;

	getEvent(code: string): Observable<PublicEvent> {
		return this.httpClient.get<PublicEvent>(`${this.baseUrl}/events/${code}`);
	}

	// Se llama ANTES de getEvent() — si el evento no tiene sala de espera prendida, responde
	// `enabled:false` de inmediato sin que el visitante dispare nunca la query pesada de getEvent()
	// mientras espera (ver public-event.component.ts).
	joinWaitingRoom(code: string, sessionId: string): Observable<WaitingRoomResult> {
		return this.httpClient.post<WaitingRoomResult>(`${this.baseUrl}/events/${code}/waiting-room/join`, { sessionId });
	}

	getWaitingRoomStatus(code: string, sessionId: string): Observable<WaitingRoomResult> {
		return this.httpClient.get<WaitingRoomResult>(`${this.baseUrl}/events/${code}/waiting-room/status`, { params: { sessionId } });
	}

	getOrg(slug: string): Observable<PublicOrg> {
		return this.httpClient.get<PublicOrg>(`${this.baseUrl}/org/${slug}`);
	}

	purchase(input: PurchaseInput): Observable<PurchaseResult> {
		return this.httpClient.post<PurchaseResult>(`${this.baseUrl}/purchase`, input);
	}

	// "Aparta" el/los asiento(s) (SaleTicket en PENDING, ver public.ts) mientras el comprador paga —
	// PayPal lo usa para saber el total antes de crear la orden; Link lo usa para mostrar el link de
	// pago con el asiento ya reservado.
	holdCheckout(input: CheckoutHoldInput): Observable<CheckoutHoldResult> {
		return this.httpClient.post<CheckoutHoldResult>(`${this.baseUrl}/checkout/hold`, input);
	}

	createPaypalOrder(holdIds: number[]): Observable<PaypalOrderResult> {
		return this.httpClient.post<PaypalOrderResult>(`${this.baseUrl}/checkout/paypal/order`, { holdIds });
	}

	capturePaypalOrder(orderId: string): Observable<PaypalCaptureResult> {
		return this.httpClient.post<PaypalCaptureResult>(`${this.baseUrl}/checkout/paypal/capture`, { orderId });
	}

	// Chequea el tope de invitados de un socio ANTES de dejar elegir asiento — evita que un invitado
	// arme toda su selección para recién enterarse del rechazo al confirmar (ver public.ts).
	getSponsorStatus(code: string, carnet: string): Observable<SponsorStatus> {
		return this.httpClient.get<SponsorStatus>(`${this.baseUrl}/events/${code}/sponsor-status`, { params: { carnet } });
	}

	// Chequea si esta persona (por email o carnet) ya se registró en otra fecha vinculada del mismo
	// evento (ver Event.duplicateGroupKey) ANTES de dejar elegir asiento — mismo espíritu que
	// getSponsorStatus, evita hacer perder tiempo armando una selección que el submit igual rechaza.
	getDuplicateEventStatus(code: string, email: string, carnet: string): Observable<DuplicateEventStatus> {
		return this.httpClient.get<DuplicateEventStatus>(`${this.baseUrl}/events/${code}/duplicate-check`, { params: { email, carnet } });
	}
}
