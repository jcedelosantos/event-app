export interface Seat {
	id: number;
	name: string;
	icon: string;
	type: string;
	x: number;
	y: number;
	radio: number;
	color: string;
	size: number;
	tableId?: number | null;
}
