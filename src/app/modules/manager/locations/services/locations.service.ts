import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Location } from '../../../../models/locations/location';
import { environment } from '../../../../../environments/environment';

export type LocationInput = {
	name: string;
	address?: string | null;
	active?: boolean;
};

@Injectable({
	providedIn: 'root',
})
export class LocationsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/locations`;

	getLocations(): Observable<Location[]> {
		return this.httpClient.get<Location[]>(this.baseUrl);
	}

	createLocation(location: LocationInput): Observable<Location> {
		return this.httpClient.post<Location>(this.baseUrl, location);
	}

	updateLocation(id: number, location: Partial<LocationInput>): Observable<Location> {
		return this.httpClient.put<Location>(`${this.baseUrl}/${id}`, location);
	}

	deleteLocation(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
