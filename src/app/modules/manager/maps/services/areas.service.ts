import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Area } from '../../../../models/maps/area';
import { environment } from '../../../../../environments/environment';

export type AreaInput = {
	name: string;
	description?: string;
	img?: string;
	icon?: string;
	type?: string;
	x?: number;
	y?: number;
	radio?: number;
	color?: string;
	size?: number;
	backGround?: string;
	mapId: number;
};

@Injectable({ providedIn: 'root' })
export class AreasService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/areas`;

	getAreasByMap(mapId: number): Observable<Area[]> {
		return this.httpClient.get<Area[]>(this.baseUrl, { params: { mapId } });
	}

	getArea(id: number): Observable<Area> {
		return this.httpClient.get<Area>(`${this.baseUrl}/${id}`);
	}

	createArea(area: AreaInput): Observable<Area> {
		return this.httpClient.post<Area>(this.baseUrl, area);
	}

	updateArea(id: number, area: Partial<AreaInput>): Observable<Area> {
		return this.httpClient.put<Area>(`${this.baseUrl}/${id}`, area);
	}

	deleteArea(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
