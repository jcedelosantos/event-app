export interface AccessPoint {
	id: number;
	name: string;
	active: boolean;
	eventId: number;
	tenantId: number;
	// IDs de los Ticket permitidos por esta puerta — vacío = sin restricción (deja pasar cualquier
	// ticket, ver AccessPointTicket en el schema del backend).
	ticketIds: number[];
	// Nombre del evento (el escáner no está acotado a un solo evento, ver qr-scanner.component.ts —
	// necesita distinguir puertas de mismo nombre en eventos distintos).
	event?: { id: number; name: string };
}

export interface AccessPointStats {
	id: number;
	name: string;
	active: boolean;
	checkedIn: number;
	recentCount: number;
}

export interface AccessPointStatsResponse {
	eventTotal: number;
	windowMinutes: number;
	accessPoints: AccessPointStats[];
}
