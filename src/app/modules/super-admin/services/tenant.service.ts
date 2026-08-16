import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Tenant, TenantType } from '../../../models/tenants/tenant';
import { User } from '../../../models/users/user';
import { environment } from '../../../../environments/environment';

export type SubscriptionInfo = {
	id: number;
	plan: string;
	status: string;
	paypalSubscriptionId: string | null;
	currentPeriodEnd: string | null;
} | null;

export type EventOverage = { eventId: number; eventName: string; soldCount: number; included: number; overageCount: number; overageUSD: number };

export type TenantSubscriptionDetail = { subscription: SubscriptionInfo; overage: { totalUSD: number; events: EventOverage[] } };

export type CreateTenantInput = {
	name: string;
	type?: TenantType;
	admin: {
		username: string;
		password: string;
		name: string;
		lastname: string;
		email: string;
	};
};

@Injectable({
	providedIn: 'root',
})
export class TenantService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/tenants`;

	getTenants(): Observable<Tenant[]> {
		return this.httpClient.get<Tenant[]>(this.baseUrl);
	}

	createTenant(input: CreateTenantInput): Observable<Tenant> {
		return this.httpClient.post<Tenant>(this.baseUrl, input);
	}

	setActive(id: number, active: boolean): Observable<Tenant> {
		return this.httpClient.put<Tenant>(`${this.baseUrl}/${id}`, { active });
	}

	updateTenant(id: number, data: { name: string; type: TenantType; rnc?: string; address?: string; phone?: string }): Observable<Tenant> {
		return this.httpClient.put<Tenant>(`${this.baseUrl}/${id}`, data);
	}

	// Ver POST /tenants/:id/reactivate en la API — solo aplica a tenants de evento único ARCHIVED
	// (ver lib/event-plan-expiry.ts), vuelve a ACTIVE a mano, sin automatizar nada.
	reactivate(id: number): Observable<Tenant> {
		return this.httpClient.post<Tenant>(`${this.baseUrl}/${id}/reactivate`, {});
	}

	impersonate(id: number): Observable<{ token: string; user: User }> {
		return this.httpClient.post<{ token: string; user: User }>(`${this.baseUrl}/${id}/impersonate`, {});
	}

	getSubscription(id: number): Observable<TenantSubscriptionDetail> {
		return this.httpClient.get<TenantSubscriptionDetail>(`${this.baseUrl}/${id}/subscription`);
	}

	// El status local recién se actualiza cuando llega el webhook de PayPal (ver signup.ts en la
	// API) — este endpoint solo dispara la cancelación del lado de PayPal.
	cancelSubscription(id: number, reason?: string): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/${id}/subscription/cancel`, { reason });
	}

	// blob (no JSON): el interceptor de auth igual agrega el Bearer token, así que un <a href> plano
	// no serviría acá (no manda el header) — hay que pedirlo por HttpClient y bajarlo a mano.
	downloadInvoice(id: number): Observable<Blob> {
		return this.httpClient.get(`${this.baseUrl}/${id}/invoice`, { responseType: 'blob' });
	}
}
