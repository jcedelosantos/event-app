import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PlanCode } from '../../../shared/pricing-plans';

export type UpgradeResult = { approveUrl: string | null };

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/subscription`;

	upgrade(plan: PlanCode): Observable<UpgradeResult> {
		return this.httpClient.post<UpgradeResult>(`${this.baseUrl}/upgrade`, { plan });
	}
}
