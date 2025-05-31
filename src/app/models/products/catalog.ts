import { Product } from './product';

export interface Catalog {
	id: number;
	name: string;
	products?: Array<Product>;
	type: string;
	description: string;
}
