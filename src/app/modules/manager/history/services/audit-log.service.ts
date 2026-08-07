import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AuditLog } from '../../../../models/audit/audit-log';
import { environment } from '../../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class AuditLogService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/audit-logs`;

	// El backend acota esto a las 300 entradas más recientes (ver audit-logs.ts) — totalCount viene
	// del header X-Total-Count para poder avisar en la UI cuando hay más actividad que la que se ve.
	getAuditLogs(entity?: string): Observable<{ items: AuditLog[]; totalCount: number | null }> {
		return this.httpClient
			.get<AuditLog[]>(this.baseUrl, { params: entity ? { entity } : {}, observe: 'response' })
			.pipe(map((res) => ({ items: res.body ?? [], totalCount: parseTotalCount(res.headers.get('X-Total-Count')) })));
	}
}

function parseTotalCount(value: string | null): number | null {
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}
