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
	// Ubicación real (lat/lng) elegida con el picker de Google Maps al crear el mapa — puede seguir
	// siendo el pin por defecto si el manager nunca lo reubicó, ver hasRealMapLocation() en
	// public-event.component.ts antes de mostrar cualquier link "Cómo llegar" con esto.
	x: number;
	y: number;
	areas: PublicArea[];
} | null;

export type PublicTicket = {
	id: number;
	name: string;
	type: string;
	// Centavos enteros, no dólares (ver shared/money.ts).
	priceCents: number;
	description: string;
	areaId: number | null;
	count: number;
	// Solo viene seteado en tenants CLUB — el picker público lo usa para auto-elegir el ticket según
	// la respuesta a "¿Eres socio o invitado?" (ver public-event.component.ts).
	attendeeType: 'SOCIO' | 'INVITADO' | null;
};

// Producto del evento vendible junto al ticket desde el carrito (ver GET /public/events/:code) —
// isMealOfTheDay queda afuera (ese producto solo se ofrece vía el registro de hijos, ver
// hasMealOfTheDay). `available` es el stock real restante, se manda igual en 0 para mostrarlo
// agotado en vez de hacerlo desaparecer sin explicación (mismo criterio que PublicTicket.count).
export type PublicEventProduct = {
	id: number;
	name: string;
	description: string;
	img: string;
	type: string;
	variant: string;
	priceCents: number;
	available: number;
};

export type TenantType = 'GENERAL' | 'CLUB' | 'CHURCH' | 'ONG' | 'PRIVADA' | 'PUBLICA' | 'INDEPENDIENTE';

// null = este evento no exige pago online (Event.paymentMode = NONE), el registro sigue siendo
// gratis como siempre. paypalClientId/linkUrl pueden venir null igual si el manager activó el modo
// pero todavía no cargó las credenciales en Settings → Pagos. bankInfo null = el manager no cargó
// datos bancarios propios — el checkout solo muestra linkUrl en ese caso, igual que antes.
export type PublicEventBankInfo = { bankName: string; bankAccountType: string; bankAccountNumber: string; bankAccountHolder: string };
export type PublicEventPayment = {
	mode: 'PAYPAL' | 'LINK' | 'BOTH';
	paypalClientId: string | null;
	linkUrl: string | null;
	bankInfo: PublicEventBankInfo | null;
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
	products: PublicEventProduct[];
	map: PublicMap;
	// Si es CLUB, hay que pedir socio/invitado + carnet al reservar (ver AttendeeType más abajo).
	tenantType: TenantType;
	// Branding del club — ver public-event.component.ts, header sobre el nombre del evento.
	tenantName: string | null;
	tenantLogoUrl: string | null;
	// Solo relevante en tenants CHURCH — habilita el checkbox "¿retira comida?" al registrar hijos.
	hasMealOfTheDay: boolean;
	payment: PublicEventPayment | null;
	// RD$ por USD, configurado en Settings → Pagos — null si el club nunca lo cargó (los precios se
	// muestran solo en USD en ese caso, ver formatDualCurrency en shared/money.ts).
	exchangeRateRD: number | null;
	// Solo relevante en tenants CLUB — cuántos invitados puede cargar un socio (inline en su propia
	// compra, o por auto-registro independiente vía sponsorCarnet, ver getSponsorStatus). Viene
	// siempre seteado (fallback al default del backend), inofensivo si no se usa.
	maxGuestsPerSponsor: number;
	// Aforo compartido del evento ya lleno (Event.maxCapacity) — distinto de que un tipo de ticket
	// puntual esté agotado, ver purchaseBlockedReason en public-event.component.ts.
	capacityFull: boolean;
	// ACTIVE | CANCELLED | POSTPONED — ver purchaseBlockedReason en public-event.component.ts.
	status: 'ACTIVE' | 'CANCELLED' | 'POSTPONED';
};

export type RegisterInput = { name: string; lastname: string; email: string; phone: string; carnet: string };

export type AttendeeType = 'SOCIO' | 'INVITADO';

// Solo se manda en tenants CHURCH — ver public-event.component.ts, sección "¿Vienes con hijos?".
export type ChildDraftInput = { name: string; age?: number; wantsMeal?: boolean };

// Solo se manda en tenants CLUB, dentro de la compra de un SOCIO (ver public-event.component.ts,
// sección "¿Traés invitados?") — cada invitado termina con su propio registro/QR, en vez de que
// todos los asientos elegidos queden a nombre del socio (ver api/src/routes/public.ts /purchase).
export type GuestDraftInput = { name: string; lastname: string; phone: string; email?: string };

// Línea del carrito de productos (ver PublicEventProduct) — siempre acompaña una compra de al menos
// un ticket, nunca va sola (ver public-event.component.ts, seatIds ya exige mínimo 1 asiento).
export type ProductCartInput = { productId: number; quantity: number };

export type PurchaseInput = {
	eventCode: string;
	ticketId: number;
	client: RegisterInput;
	seatIds: number[];
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
	children?: ChildDraftInput[];
	guests?: GuestDraftInput[];
	products?: ProductCartInput[];
	// Si venía de la sala de espera (ver waitingRoomSessionId en public-event.component.ts), libera su
	// cupo apenas la compra se confirma — sin esto, el cupo se mantenía "ocupado" los 20 minutos
	// completos de ADMISSION_WINDOW_MS aunque la persona ya haya terminado y cerrado la pestaña.
	waitingRoomSessionId?: string;
};

// Checkout con pago (ver Event.paymentMode) — sin `children`, a propósito: un evento con cobro
// online vende solo tickets/asientos + productos en esta primera vuelta (ver public.ts
// /checkout/hold).
export type CheckoutHoldInput = {
	eventCode: string;
	ticketId: number;
	client: RegisterInput;
	seatIds: number[];
	attendeeType?: AttendeeType;
	sponsorCarnet?: string;
	products?: ProductCartInput[];
	provider: 'PAYPAL' | 'LINK';
};

// `holdToken` ata este hold al comprador que lo creó — hay que devolverlo junto con `holdIds` en
// createPaypalOrder para probar que es el mismo comprador (ver schema.prisma SaleTicket.holdToken).
// `productHoldIds` viaja solo informativamente: /checkout/paypal/order, /capture y /submit-receipt
// encuentran los holds de producto por holdToken, no hace falta reenviarlos.
export type CheckoutHoldResult = { holdIds: number[]; productHoldIds: number[]; holdToken: string; totalCents: number; expiresAt: string };
export type PaypalOrderResult = { orderId: string };
export type PaypalCaptureResult = { saleTickets: PurchasedSaleTicket[]; saleProducts: PurchasedSaleProduct[] };

export type PurchasedSaleTicket = {
	id: number;
	codeQR: string;
	seat: { name: string; area: { name: string } };
	ticket: { name: string; type: string; priceCents: number };
};

export type PurchasedSaleProduct = {
	id: number;
	codeQR: string;
	quantity: number;
	unitPriceCents: number | null;
	product: { name: string; type: string; priceCents: number };
};

export type PurchasedChild = { id: number; name: string; codeQR: string };

export type PurchaseResult = { saleTickets: PurchasedSaleTicket[]; children: PurchasedChild[]; saleProducts: PurchasedSaleProduct[] };

export type SponsorStatus = { registered: boolean; used: number; max: number; blocked: boolean };

// Consulta la simulación de membresía del club (ver api/src/lib/club-members.ts) por el carnet del
// PROPIO socio que está comprando — a diferencia de SponsorStatus (que valida el carnet de otra
// persona), acá sí vienen los datos de contacto para autocompletar el form. found:false = el
// carnet no existe; active:false + found:true = existe pero está inactivo (mensajes distintos, ver
// applyMemberStatus). name/lastname/email/phone solo vienen si está activo — el mensaje de bloqueo
// para el caso inactivo usa el carnet, no el nombre (decisión del club por privacidad).
export type MemberStatus = {
	found: boolean;
	active: boolean;
	name?: string;
	lastname?: string;
	email?: string;
	phone?: string;
};

export type DuplicateEventStatus = { blocked: boolean; reason: string | null };

// enabled:false = el evento no usa sala de espera (o ya no queda en cola) — el frontend sigue
// directo al picker. admitted:true + position:null = ya puede pasar. admitted:false + position = su
// lugar en la fila (1-based). tenantName/tenantLogoUrl/eventName/eventImg solo vienen seteados con
// enabled:true — se usan para mostrar el evento y la organización en la pantalla de espera. Ver
// api/src/lib/waiting-room.ts para el diseño completo.
export type WaitingRoomResult = {
	enabled: boolean;
	admitted: boolean;
	position: number | null;
	tenantName: string | null;
	tenantLogoUrl: string | null;
	eventName: string | null;
	eventImg: string | null;
};

export type PublicOrgEvent = {
	id: number;
	name: string;
	code: string;
	// Usado para el link de la tarjeta (ver org-landing.component.ts) — code queda solo para
	// referencia interna, no es válido para armar rutas públicas /e/:code (ver Event.publicSlug).
	publicSlug: string;
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
	// evento queda visible en el listado, solo no es elegible hasta esa fecha); capacityFull = el
	// aforo compartido del evento (Event.maxCapacity) ya se llenó, aunque algún tipo de ticket
	// todavía tenga stock propio — ver lib/capacity.ts.
	inactive: boolean;
	soldOut: boolean;
	scheduled: boolean;
	capacityFull: boolean;
	status: 'ACTIVE' | 'CANCELLED' | 'POSTPONED';
};

// Portada pública de una organización — lista sus próximos eventos activos (ver org-landing).
export type PublicOrg = {
	name: string;
	slug: string;
	type: TenantType;
	logoUrl: string | null;
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

	// Comprobante de transferencia durante la Opción "Link" con datos bancarios cargados — mismo
	// patrón de dos pasos que signup.service.ts (subir el archivo, después adjuntar la URL contra el
	// hold), ver POST /checkout/upload-receipt y /checkout/submit-receipt en public.ts.
	uploadCheckoutReceipt(file: File): Observable<{ url: string }> {
		const formData = new FormData();
		formData.append('file', file);
		return this.httpClient.post<{ url: string }>(`${this.baseUrl}/checkout/upload-receipt`, formData);
	}

	submitCheckoutReceipt(holdIds: number[], holdToken: string, receiptUrl: string): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/checkout/submit-receipt`, { holdIds, holdToken, receiptUrl });
	}

	getWaitingRoomStatus(code: string, sessionId: string): Observable<WaitingRoomResult> {
		return this.httpClient.get<WaitingRoomResult>(`${this.baseUrl}/events/${code}/waiting-room/status`, { params: { sessionId } });
	}

	// Salida voluntaria (botón "Salir de la fila") — libera el cupo al toque en vez de esperar a que
	// venza por tiempo.
	leaveWaitingRoom(code: string, sessionId: string): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/events/${code}/waiting-room/leave`, { sessionId });
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

	createPaypalOrder(holdIds: number[], holdToken: string): Observable<PaypalOrderResult> {
		return this.httpClient.post<PaypalOrderResult>(`${this.baseUrl}/checkout/paypal/order`, { holdIds, holdToken });
	}

	capturePaypalOrder(orderId: string): Observable<PaypalCaptureResult> {
		return this.httpClient.post<PaypalCaptureResult>(`${this.baseUrl}/checkout/paypal/capture`, { orderId });
	}

	// Chequea el tope de invitados de un socio ANTES de dejar elegir asiento — evita que un invitado
	// arme toda su selección para recién enterarse del rechazo al confirmar (ver public.ts).
	getSponsorStatus(code: string, carnet: string): Observable<SponsorStatus> {
		return this.httpClient.get<SponsorStatus>(`${this.baseUrl}/events/${code}/sponsor-status`, { params: { carnet } });
	}

	getMemberStatus(code: string, carnet: string): Observable<MemberStatus> {
		return this.httpClient.get<MemberStatus>(`${this.baseUrl}/events/${code}/member-status`, { params: { carnet } });
	}

	// Chequea si esta persona (por email o carnet) ya se registró en otra fecha vinculada del mismo
	// evento (ver Event.duplicateGroupKey) ANTES de dejar elegir asiento — mismo espíritu que
	// getSponsorStatus, evita hacer perder tiempo armando una selección que el submit igual rechaza.
	getDuplicateEventStatus(code: string, email: string, carnet: string): Observable<DuplicateEventStatus> {
		return this.httpClient.get<DuplicateEventStatus>(`${this.baseUrl}/events/${code}/duplicate-check`, { params: { email, carnet } });
	}
}
