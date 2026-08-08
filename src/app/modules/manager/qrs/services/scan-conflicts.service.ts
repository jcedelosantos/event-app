import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ScanConflict } from '../../../../models/scan-conflicts/scan-conflict';
import { environment } from '../../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class ScanConflictsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/scan/conflicts`;

	getByEvent(eventId: number): Observable<ScanConflict[]> {
		return this.httpClient.get<ScanConflict[]>(this.baseUrl, { params: { eventId } });
	}

	resolve(id: number): Observable<ScanConflict> {
		return this.httpClient.put<ScanConflict>(`${this.baseUrl}/${id}/resolve`, {});
	}
}
