import { Map } from '../maps/map';
import { Ticket } from '../tickets/ticket';
import { Product } from '../products/product';

export interface Events {
	id: number;
	userId: number;
	name: string;
	img: string;
	code: string;
	type: string;
	description: string;
	dateSale: Date;
	dateOn: Date;
	dateOff: Date;
	startTime: string | null;
	active: boolean;
	// ACTIVE (default) | CANCELLED | POSTPONED — distinto de `active` (ver create-event-modal /
	// event-details): un evento cancelado/pospuesto sigue siendo `active` y sigue en el portal
	// público, solo cambia la etiqueta y se bloquea la compra.
	status: 'ACTIVE' | 'CANCELLED' | 'POSTPONED';
	hostName?: string | null;
	maxHostGuests?: number | null;
	// Solo tiene sentido en tenants CLUB — eventos que comparten este valor son "misma función,
	// distinta fecha" (ver create-event-modal). null = este evento no está vinculado a ningún otro.
	duplicateGroupKey?: string | null;
	// Si el portal público de este evento exige pago online antes de reservar el asiento, y con qué
	// método(s) — ver create-event-modal (select "Cobro") y public-event.component.ts.
	paymentMode: 'NONE' | 'PAYPAL' | 'LINK' | 'BOTH';
	// Cuántas horas antes de startTime se habilita el check-in/entrega en el scanner (ver
	// create-event-modal). Default 1, configurable por evento.
	checkInWindowHours: number;
	// Fecha/hora de publicación en el portal público (ver public.ts) — null = sin restricción,
	// visible ya mismo. Permite subir y configurar un evento con anticipación sin exponerlo todavía.
	publishAt?: Date | null;
	// Sala de espera virtual del picker público (ver public-event.component.ts). false por defecto.
	waitingRoomEnabled: boolean;
	waitingRoomBatchSize?: number | null;
	// Cupo total del evento, compartido entre todos los tipos de ticket — aplica a cualquier tenant.
	// null = sin tope (ver lib/capacity.ts en la API).
	maxCapacity?: number | null;
	// Solo tiene sentido en tenants CLUB — cuántos invitados puede traer un socio a este evento. null
	// = usa el default del código (MAX_INVITADOS_PER_SOCIO).
	maxGuestsPerSponsor?: number | null;
	// Texto libre opcional, se agrega al email de confirmación del ticket.
	confirmationMessage?: string | null;
	map?: Map;
	tickets: Array<Ticket>;
	products: Array<Product>;
}
