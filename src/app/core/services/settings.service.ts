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

	// Logo del tenant — no es una AppSetting más, vive directo en Tenant.logoUrl (ver settings.ts
	// backend), por eso tiene su propio endpoint en vez de reusar setSetting().
	setLogo(logoUrl: string | null): Observable<{ logoUrl: string | null }> {
		return this.httpClient.put<{ logoUrl: string | null }>(`${this.baseUrl}/logo`, { logoUrl });
	}
}
