import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type SurveyStatus = { ready: false } | { ready: true; surveyUrl: string };

@Injectable({ providedIn: 'root' })
export class SurveyService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public`;

	getStatus(eventCode: string): Observable<SurveyStatus> {
		return this.httpClient.get<SurveyStatus>(`${this.baseUrl}/survey/${eventCode}`);
	}
}
