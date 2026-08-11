import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { EventPlanCode } from '../../../shared/event-plans';

export type SignupEventInput = {
	organization: { name: string; type: 'GENERAL' | 'CLUB' | 'CHURCH' };
	admin: { username: string; password: string; name: string; lastname: string; email: string };
	eventPlanCode: EventPlanCode;
	paymentMethod: 'PAYPAL' | 'BANK_TRANSFER';
};

// orderId solo viene con PayPal — con transferencia bancaria el backend no crea ninguna orden (ver
// routes/signup-event.ts).
export type SignupEventResult = { tenantId: number; orderId?: string };
export type CaptureResult = { tenantId: number; planStatus: string };
export type BankInfo = { bankName: string; bankAccountType: string; bankAccountNumber: string; bankAccountHolder: string };

@Injectable({ providedIn: 'root' })
export class SignupEventService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public`;

	getPaypalClientId(): Observable<{ clientId: string }> {
		return this.httpClient.get<{ clientId: string }>(`${this.baseUrl}/signup-event/paypal-client-id`);
	}

	signup(input: SignupEventInput): Observable<SignupEventResult> {
		return this.httpClient.post<SignupEventResult>(`${this.baseUrl}/signup-event`, input);
	}

	capture(tenantId: number, orderId: string): Observable<CaptureResult> {
		return this.httpClient.post<CaptureResult>(`${this.baseUrl}/signup-event/capture`, { tenantId, orderId });
	}

	getBankInfo(): Observable<BankInfo> {
		return this.httpClient.get<BankInfo>(`${this.baseUrl}/signup-event/bank-info`);
	}

	uploadReceipt(file: File): Observable<{ url: string }> {
		const formData = new FormData();
		formData.append('file', file);
		return this.httpClient.post<{ url: string }>(`${this.baseUrl}/signup-event/upload-receipt`, formData);
	}

	submitReceipt(tenantId: number, receiptUrl: string): Observable<{ tenantId: number; planStatus: string }> {
		return this.httpClient.post<{ tenantId: number; planStatus: string }>(`${this.baseUrl}/signup-event/submit-receipt`, { tenantId, receiptUrl });
	}
}
