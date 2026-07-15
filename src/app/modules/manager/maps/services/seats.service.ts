import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Seat } from '../../../../models/maps/seat';
import { environment } from '../../../../../environments/environment';

export type SeatInput = {
	name: string;
	icon?: string;
	type?: string;
	x?: number;
	y?: number;
	radio?: number;
	color?: string;
	size?: number;
	areaId: number;
	tableId?: number | null;
};

@Injectable({ providedIn: 'root' })
export class SeatsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/seats`;

	getSeatsByArea(areaId: number): Observable<Seat[]> {
		return this.httpClient.get<Seat[]>(this.baseUrl, { params: { areaId } });
	}

	createSeat(seat: SeatInput): Observable<Seat> {
		return this.httpClient.post<Seat>(this.baseUrl, seat);
	}

	updateSeat(id: number, seat: Partial<SeatInput>): Observable<Seat> {
		return this.httpClient.put<Seat>(`${this.baseUrl}/${id}`, seat);
	}

	// Una sola request para N asientos en vez de un PUT por asiento — ver bulk-edit-tables-modal.
	bulkResizeSeats(ids: number[], size: number): Observable<Seat[]> {
		return this.httpClient.put<Seat[]>(`${this.baseUrl}/bulk-resize`, { ids, size });
	}

	deleteSeat(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
