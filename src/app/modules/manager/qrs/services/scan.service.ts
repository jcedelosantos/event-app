import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SaleTicket } from './qr.service';
import { SaleProduct } from './product-sales.service';

export type ScanResult = { type: 'ticket'; ok: true; saleTicket: SaleTicket } | { type: 'product'; ok: true; saleProduct: SaleProduct };

@Injectable({
	providedIn: 'root',
})
export class ScanService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/scan`;

	scan(codeQR: string): Observable<ScanResult> {
		return this.httpClient.post<ScanResult>(this.baseUrl, { codeQR });
	}
}
