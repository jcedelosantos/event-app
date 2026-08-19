import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiKey, CreatedApiKey } from '../../../../models/api-keys/api-key';
import { environment } from '../../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class ApiKeysService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/api-keys`;

	getApiKeys(): Observable<ApiKey[]> {
		return this.httpClient.get<ApiKey[]>(this.baseUrl);
	}

	createApiKey(name: string): Observable<CreatedApiKey> {
		return this.httpClient.post<CreatedApiKey>(this.baseUrl, { name });
	}

	revokeApiKey(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
