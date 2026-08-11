import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export type EnterpriseLeadInput = {
	orgName: string;
	contactName: string;
	email: string;
	phone?: string;
	message?: string;
};

@Injectable({ providedIn: 'root' })
export class EnterpriseLeadService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/enterprise-leads`;

	// Sin auth: quien completa este formulario todavía no tiene cuenta (ver comentario en
	// routes/enterprise-leads.ts).
	submit(input: EnterpriseLeadInput): Observable<void> {
		return this.httpClient.post<void>(this.baseUrl, input);
	}
}
