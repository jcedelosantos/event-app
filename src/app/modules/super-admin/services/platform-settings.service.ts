import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Config global de facturación (emisor + banco + próximo NCF) — ver lib/invoice-config.ts en la API.
export type InvoiceSettings = {
	invoiceIssuerName: string;
	invoiceIssuerRnc: string;
	invoiceIssuerEmail: string;
	invoiceIssuerPhone: string;
	invoiceIssuerAddress: string;
	invoiceIssuerLogoUrl: string;
	invoiceBankName: string;
	invoiceBankAccountType: string;
	invoiceBankAccountNumber: string;
	invoiceBankAccountHolder: string;
	invoiceNcfPrefix: string;
	invoiceNcfNext: string;
};

@Injectable({ providedIn: 'root' })
export class PlatformSettingsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/platform-settings`;

	getSettings(): Observable<InvoiceSettings> {
		return this.httpClient.get<InvoiceSettings>(this.baseUrl);
	}

	setSetting(key: keyof InvoiceSettings, value: string): Observable<{ ok: boolean }> {
		return this.httpClient.put<{ ok: boolean }>(`${this.baseUrl}/${key}`, { value });
	}

	uploadLogo(file: File): Observable<{ url: string }> {
		const formData = new FormData();
		formData.append('file', file);
		return this.httpClient.post<{ url: string }>(`${this.baseUrl}/logo`, formData);
	}
}
