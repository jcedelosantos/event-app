import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PlanCode } from '../../../shared/pricing-plans';

export type UpgradeResult = { approveUrl: string | null };

// Ver GET /subscription/overage-nudge en la API — shouldUpgrade=false cuando el tenant no tiene un
// plan recurrente reconocido, ya está en el tier más alto, o el excedente acumulado todavía no
// supera lo que costaría el siguiente escalón.
export type OverageNudge = { shouldUpgrade: boolean; suggestedPlan?: PlanCode | null; suggestedPlanName?: string | null; overageCents?: number; priceDiffCents?: number };

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/subscription`;

	upgrade(plan: PlanCode): Observable<UpgradeResult> {
		return this.httpClient.post<UpgradeResult>(`${this.baseUrl}/upgrade`, { plan });
	}

	getOverageNudge(): Observable<OverageNudge> {
		return this.httpClient.get<OverageNudge>(`${this.baseUrl}/overage-nudge`);
	}
}
