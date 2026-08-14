import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PlanCode } from '../../../shared/pricing-plans';

export type SignupInput = {
	organization: { name: string; type: 'GENERAL' | 'CLUB' | 'CHURCH' | 'ONG' | 'PRIVADA' | 'PUBLICA' | 'INDEPENDIENTE' };
	admin: { username: string; password: string; name: string; lastname: string; email: string };
	plan: PlanCode;
};

export type SignupResult = { tenantId: number; paypalSubscriptionId: string; approveUrl: string };

export type SubscriptionStatus = { plan: PlanCode; status: 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' };

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
}
