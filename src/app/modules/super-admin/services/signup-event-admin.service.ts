import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type PendingReceiptTenant = {
	id: number;
	name: string;
	slug: string;
	plan: string;
	paymentReceiptUrl: string | null;
	createdAt: string;
};

@Injectable({
	providedIn: 'root',
})
export class SignupEventAdminService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public/signup-event`;

	getAll(): Observable<PendingReceiptTenant[]> {
		return this.httpClient.get<PendingReceiptTenant[]>(`${this.baseUrl}/admin`);
	}

	review(tenantId: number, approve: boolean): Observable<{ tenantId: number; planStatus: string }> {
		return this.httpClient.put<{ tenantId: number; planStatus: string }>(`${this.baseUrl}/${tenantId}/review`, { approve });
	}
}
