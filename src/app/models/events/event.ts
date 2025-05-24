import { Map } from '../maps/map';
import { Area } from '../maps/area';
import { Ticket } from '../tickets/ticket';
import { Catalog } from '../products/catalog';

export interface Event {
	id: number;
	userId: number;
	clientId: number;
	name: string;
	img: string;
	code: string;
	type: string;
	description: string;
	dateSale: Date;
	dateOn: Date;
	dateOff: Date;
	active: boolean;
	map: Map;
	areas: Array<Area>;
	tickets: Array<Ticket>;
	locaction: [string, string];
	catalogs: Array<Catalog>;
}
