import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SaleTicket } from './qr.service';
import { SaleProduct } from './product-sales.service';
import { Child } from './children.service';

export type ScanResult =
	| { type: 'ticket'; ok: true; saleTicket: SaleTicket }
	| { type: 'product'; ok: true; saleProduct: SaleProduct }
	// Talón familiar (tenants CHURCH) — un escaneo entrega a TODOS los hermanos pendientes de una
	// vez (ver api/src/routes/scan.ts), por eso viene como lista en vez de un solo Child.
	| { type: 'child'; ok: true; children: Child[] };

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
