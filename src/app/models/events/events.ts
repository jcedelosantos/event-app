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
	active: boolean;
	map?: Map;
	tickets: Array<Ticket>;
	products: Array<Product>;
}
