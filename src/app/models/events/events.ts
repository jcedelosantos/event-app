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
	hostName?: string | null;
	maxHostGuests?: number | null;
	// Solo tiene sentido en tenants CLUB — eventos que comparten este valor son "misma función,
	// distinta fecha" (ver create-event-modal). null = este evento no está vinculado a ningún otro.
	duplicateGroupKey?: string | null;
	map?: Map;
	tickets: Array<Ticket>;
	products: Array<Product>;
}
