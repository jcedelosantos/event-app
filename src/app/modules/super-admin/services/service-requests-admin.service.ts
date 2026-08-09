import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-requests/service-request';
import { environment } from '../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class ServiceRequestsAdminService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/service-requests`;

	getAll(): Observable<ServiceRequest[]> {
		return this.httpClient.get<ServiceRequest[]>(`${this.baseUrl}/admin`);
	}

	updateStatus(id: number, status: ServiceRequestStatus, resolutionNote?: string): Observable<ServiceRequest> {
		return this.httpClient.put<ServiceRequest>(`${this.baseUrl}/${id}/status`, { status, resolutionNote });
	}
}
