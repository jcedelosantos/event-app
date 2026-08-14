import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PlanCode } from '../../../shared/pricing-plans';

export type SignupInput = {
	organization: { name: string; type: 'GENERAL' | 'CLUB' | 'CHURCH' | 'ONG' | 'PRIVADA' | 'PUBLICA' | 'INDEPENDIENTE' };
	admin: { username: string; password: string; name: string; lastname: string; email: string };
	plan: PlanCode;
	paymentMethod: 'PAYPAL' | 'BANK_TRANSFER';
};

// approveUrl/paypalSubscriptionId solo vienen con PayPal — con transferencia bancaria el backend no
// crea ninguna suscripción todavía (ver routes/signup.ts).
export type SignupResult = { tenantId: number; paypalSubscriptionId?: string; approveUrl?: string };

export type SubscriptionStatus = { plan: PlanCode; status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'PENDING_REVIEW' };

// Mismo shape que BankInfo de signup-event.service.ts — no se importa de ahí porque son módulos
// hermanos sin dependencia entre sí (cada alta pública es independiente), pero los endpoints de
// datos de cuenta y subida de comprobante SÍ son los mismos (ver getBankInfo/uploadReceipt abajo:
// no tienen nada específico de evento único, así que no se duplican en el backend).
export type BankInfo = {
	bankName: string;
	bankAccountType: string;
	bankAccountNumber: string;
	bankAccountHolder: string;
	usdToDopRate: number | null;
};

@Injectable({ providedIn: 'root' })
export class SignupService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/public`;

	signup(input: SignupInput): Observable<SignupResult> {
		return this.httpClient.post<SignupResult>(`${this.baseUrl}/signup`, input);
	}

	// Sin auth: el admin recién creado todavía no inició sesión mientras espera la confirmación de
	// PayPal (ver signup-confirmation.component.ts).
	getStatus(tenantId: number): Observable<SubscriptionStatus> {
		return this.httpClient.get<SubscriptionStatus>(`${this.baseUrl}/signup/status/${tenantId}`);
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
		return this.httpClient.post<{ tenantId: number; planStatus: string }>(`${this.baseUrl}/signup/submit-receipt`, { tenantId, receiptUrl });
	}
}
