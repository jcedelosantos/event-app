import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PlanCode, Tenant, TenantType } from '../../../models/tenants/tenant';
import { User } from '../../../models/users/user';
import { Invoice } from '../../../models/invoices/invoice';
import { environment } from '../../../../environments/environment';

export type SubscriptionInfo = {
	id: number;
	plan: string;
	status: string;
	paypalSubscriptionId: string | null;
	currentPeriodEnd: string | null;
} | null;

export type EventOverage = { eventId: number; eventName: string; soldCount: number; included: number; overageCount: number; overageCents: number };

export type TenantSubscriptionDetail = { subscription: SubscriptionInfo; overage: { totalCents: number; events: EventOverage[] } };

export type CreateTenantInput = {
	name: string;
	type?: TenantType;
	// Único plan que se puede asignar acá sin pasar por PayPal (ver comentario en
	// routes/tenants.ts) — omitido = queda sin plan, igual que antes de que existiera este campo.
	plan?: PlanCode;
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

	// Borrado real (no `active: false`) — ver DELETE /tenants/:id en la API para el detalle del
	// borrado en cascada. confirmName tiene que ser el nombre exacto de la organización, misma
	// defensa que ya exige el backend contra un llamado directo sin pasar por el modal.
	deleteTenant(id: number, confirmName: string): Observable<{ ok: boolean }> {
		return this.httpClient.delete<{ ok: boolean }>(`${this.baseUrl}/${id}`, { body: { confirmName } });
	}

	updateTenant(id: number, data: { name: string; type: TenantType; rnc?: string; address?: string; phone?: string; customDomain?: string | null; plan?: PlanCode | null }): Observable<Tenant> {
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

	// Ver POST /tenants/:id/subscription/force-activate en la API — solo aplica a una suscripción
	// que quedó en PENDING sin que el webhook de PayPal la haya confirmado nunca.
	forceActivateSubscription(id: number): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/${id}/subscription/force-activate`, {});
	}

	// blob (no JSON): el interceptor de auth igual agrega el Bearer token, así que un <a href> plano
	// no serviría acá (no manda el header) — hay que pedirlo por HttpClient y bajarlo a mano.
	downloadInvoice(id: number): Observable<Blob> {
		return this.httpClient.get(`${this.baseUrl}/${id}/invoice`, { responseType: 'blob' });
	}

	// Historial global (todos los tenants) para la sección "Facturas emitidas" del panel de Super
	// Admin — ver GET /tenants/invoices en la API.
	getAllInvoices(): Observable<Invoice[]> {
		return this.httpClient.get<Invoice[]>(`${this.baseUrl}/invoices`);
	}
}
