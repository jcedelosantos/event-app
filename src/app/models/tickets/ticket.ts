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
	// Si está seteado, este ticket solo da acceso a asientos de esa área — el picker público filtra
	// las áreas visibles según el ticket elegido (ver public-event.component.ts).
	areaId: number | null;
}
