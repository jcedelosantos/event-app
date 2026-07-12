import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuditLog } from '../../../../models/audit/audit-log';
import { environment } from '../../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class AuditLogService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/audit-logs`;

	getAuditLogs(entity?: string): Observable<AuditLog[]> {
		return this.httpClient.get<AuditLog[]>(this.baseUrl, { params: entity ? { entity } : {} });
	}
}
