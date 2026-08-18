import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PaymentReceipt } from '../../../models/payment-receipts/payment-receipt';

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

	// Histórico completo (pendientes + revisados) — a diferencia de getAll() de arriba, que sigue
	// alimentando el modal de revisión tal cual (solo pendientes).
	getAllReceipts(): Observable<PaymentReceipt[]> {
		return this.httpClient.get<PaymentReceipt[]>(`${this.baseUrl}/admin/receipts`);
	}

	review(tenantId: number, approve: boolean): Observable<{ tenantId: number; planStatus: string }> {
		return this.httpClient.put<{ tenantId: number; planStatus: string }>(`${this.baseUrl}/${tenantId}/review`, { approve });
	}
}
