import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Tenant } from '../../../models/tenants/tenant';
import { User } from '../../../models/users/user';
import { environment } from '../../../../environments/environment';

export type CreateTenantInput = {
	name: string;
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

	updateTenant(id: number, data: { name: string }): Observable<Tenant> {
		return this.httpClient.put<Tenant>(`${this.baseUrl}/${id}`, data);
	}

	impersonate(id: number): Observable<{ token: string; user: User }> {
		return this.httpClient.post<{ token: string; user: User }>(`${this.baseUrl}/${id}/impersonate`, {});
	}
}
