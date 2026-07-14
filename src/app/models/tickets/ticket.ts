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
	// Nombres resueltos por el backend (select mínimo) para mostrar a qué evento/área pertenece el
	// ticket en su tarjeta, sin tener que cruzar listas de eventos/áreas aparte en el frontend.
	event?: { id: number; name: string };
	area?: { id: number; name: string } | null;
}
