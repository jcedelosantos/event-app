import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class SettingsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/settings`;

	getSettings(): Observable<Record<string, string>> {
		return this.httpClient.get<Record<string, string>>(this.baseUrl);
	}

	setSetting(key: string, value: string): Observable<{ key: string; value: string }> {
		return this.httpClient.put<{ key: string; value: string }>(`${this.baseUrl}/${key}`, { value });
	}
}
