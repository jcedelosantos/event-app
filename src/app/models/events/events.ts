import { Map } from '../maps/map';
import { Ticket } from '../tickets/ticket';
import { Catalog } from '../products/catalog';

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
	active: boolean;
	map?: Map;
	tickets: Array<Ticket>;
	catalogs: Array<Catalog>;
}
