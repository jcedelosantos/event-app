import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AccessPoint, AccessPointStatsResponse } from '../../../../models/access-points/access-point';
import { environment } from '../../../../../environments/environment';

export type AccessPointInput = {
	name: string;
	active?: boolean;
	eventId: number;
	ticketIds?: number[];
};

@Injectable({
	providedIn: 'root',
})
export class AccessPointsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/access-points`;

	getByEvent(eventId: number): Observable<AccessPoint[]> {
		return this.httpClient.get<AccessPoint[]>(this.baseUrl, { params: { eventId } });
	}

	// Todas las puertas del tenant, de cualquier evento — usado por el escáner (qr-scanner.component.ts),
	// que no está acotado a un evento en particular.
	getAll(): Observable<AccessPoint[]> {
		return this.httpClient.get<AccessPoint[]>(this.baseUrl);
	}

	getStats(eventId: number): Observable<AccessPointStatsResponse> {
		return this.httpClient.get<AccessPointStatsResponse>(`${this.baseUrl}/stats`, { params: { eventId } });
	}

	createAccessPoint(input: AccessPointInput): Observable<AccessPoint> {
		return this.httpClient.post<AccessPoint>(this.baseUrl, input);
	}

	updateAccessPoint(id: number, input: Partial<AccessPointInput>): Observable<AccessPoint> {
		return this.httpClient.put<AccessPoint>(`${this.baseUrl}/${id}`, input);
	}

	deleteAccessPoint(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
