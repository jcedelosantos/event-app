import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Map } from '../../../../models/maps/map';
import { environment } from '../../../../../environments/environment';

export type MapInput = {
	name: string;
	description?: string;
	img?: string;
	type?: string;
	x?: number;
	y?: number;
	radio?: number;
	color?: string;
	size?: number;
	backGround?: string;
};

@Injectable({ providedIn: 'root' })
export class MapsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/maps`;

	getMaps(): Observable<Map[]> {
		return this.httpClient.get<Map[]>(this.baseUrl);
	}

	getMap(id: number): Observable<Map> {
		return this.httpClient.get<Map>(`${this.baseUrl}/${id}`);
	}

	createMap(map: MapInput): Observable<Map> {
		return this.httpClient.post<Map>(this.baseUrl, map);
	}

	updateMap(id: number, map: Partial<MapInput>): Observable<Map> {
		return this.httpClient.put<Map>(`${this.baseUrl}/${id}`, map);
	}

	deleteMap(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
