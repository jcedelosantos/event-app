import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { EnterpriseLead } from '../../../models/enterprise-leads/enterprise-lead';
import { environment } from '../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class EnterpriseLeadsAdminService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/enterprise-leads`;

	getAll(): Observable<EnterpriseLead[]> {
		return this.httpClient.get<EnterpriseLead[]>(this.baseUrl);
	}

	markContacted(id: number): Observable<EnterpriseLead> {
		return this.httpClient.put<EnterpriseLead>(`${this.baseUrl}/${id}/contacted`, {});
	}
}
