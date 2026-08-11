import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ServiceRequest } from '../../../../models/service-requests/service-request';
import { AddOnServiceCode } from './addon-catalog';
import { environment } from '../../../../../environments/environment';

export type CreateServiceRequestInput = {
	packageCode?: string;
	notes?: string;
	eventId?: number;
	items: Array<{ catalogCode: AddOnServiceCode; quantity: number }>;
};

@Injectable({
	providedIn: 'root',
})
export class ServiceRequestsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/service-requests`;

	getMine(): Observable<ServiceRequest[]> {
		return this.httpClient.get<ServiceRequest[]>(this.baseUrl);
	}

	create(input: CreateServiceRequestInput): Observable<ServiceRequest> {
		return this.httpClient.post<ServiceRequest>(this.baseUrl, input);
	}

	// Solo válido mientras la solicitud sigue PENDING — el backend rechaza con 409 si ya fue
	// cotizada/resuelta (ver comentario en service-requests.ts).
	update(id: number, input: CreateServiceRequestInput): Observable<ServiceRequest> {
		return this.httpClient.put<ServiceRequest>(`${this.baseUrl}/${id}`, input);
	}
}
