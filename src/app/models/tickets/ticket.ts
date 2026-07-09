export interface Ticket {
	id: number;
	img: string;
	code: string;
	name: string;
	description: string;
	type: string;
	count: number;
	active: boolean;
	price: number;
	eventId: number;
}
