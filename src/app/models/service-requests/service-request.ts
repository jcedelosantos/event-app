import { AddOnServiceCode } from '../../modules/manager/service-requests/services/addon-catalog';

export type ServiceRequestStatus = 'PENDING' | 'QUOTED' | 'FULFILLED' | 'REJECTED';

export interface ServiceRequestItem {
	id: number;
	catalogCode: AddOnServiceCode;
	nameSnapshot: string;
	quantity: number;
	unitPriceDOPSnapshot: number | null;
}

export interface ServiceRequest {
	id: number;
	status: ServiceRequestStatus;
	packageCode: string | null;
	notes: string;
	createdAt: string;
	resolvedAt: string | null;
	resolutionNote: string | null;
	eventId: number | null;
	event: { id: number; name: string } | null;
	requestedBy: { id: number; name: string; lastname: string };
	items: ServiceRequestItem[];
	totalDOP: number;
	// Solo presente en GET /service-requests/admin (vista del Super Admin, cruza organizaciones).
	tenant?: { id: number; name: string };
}
