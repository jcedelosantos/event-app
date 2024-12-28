import { Ticket } from '../models/tickets/ticket';

const ticket_1: Ticket = {
	id: 1,
	img: '',
	code: '01',
	name: 'Pelota',
	description: 'Juego de pelota',
	type: 'VIP',
	count: '100',
	active: true,
	price: 1500,
};
const ticket_2: Ticket = {
	id: 2,
	img: '',
	code: '02',
	name: 'Pelota',
	description: 'Juego de pelota',
	type: 'NORMAL',
	count: '1000',
	active: true,
	price: 500,
};

export const tickets: Array<Ticket> = [ticket_1, ticket_2];
