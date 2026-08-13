import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Invoice } from '../../../../models/invoices/invoice';
import { environment } from '../../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InvoicesService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/invoices`;

	getMine(): Observable<Invoice[]> {
		return this.httpClient.get<Invoice[]>(this.baseUrl);
	}
}
