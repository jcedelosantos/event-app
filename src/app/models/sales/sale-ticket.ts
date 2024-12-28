export interface SaleTicket {
	id: number;
	clientId: number;
	userId: number;
	eventId: number;
	seatId: number;
	status: number;
	active: string;
	description: string;
	dateSold: Date;
	paidType: string;
	codeQR: string;
}
