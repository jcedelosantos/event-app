import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { Product } from '../../../../models/products/product';
import { User } from '../../../../models/users/user';
import { environment } from '../../../../../environments/environment';

// Solo relevante en tenants CHURCH — ver models/events/events.ts (hostName/maxHostGuests) y
// models/products/product.ts (isMealOfTheDay).
export type Child = {
	id: number;
	name: string;
	age: number | null;
	codeQR: string;
	checkedInAt: string | null;
	eventId: number;
	parentId: number;
	saleProductId: number | null;
	event: Events;
	parent: User;
	saleProduct: { id: number; deliveredAt: string | null; product: Product } | null;
};

export type ChildInput = {
	name: string;
	age?: number;
	eventId: number;
	parentId: number;
	wantsMeal?: boolean;
};

@Injectable({
	providedIn: 'root',
})
export class ChildrenService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/children`;

	getChildren(): Observable<Child[]> {
		return this.httpClient.get<Child[]>(this.baseUrl);
	}

	getChildrenByEvent(eventId: number): Observable<Child[]> {
		return this.httpClient.get<Child[]>(this.baseUrl, { params: { eventId } });
	}

	createChild(child: ChildInput): Observable<Child> {
		return this.httpClient.post<Child>(this.baseUrl, child);
	}

	setCheckedIn(id: number, checkedIn: boolean): Observable<Child> {
		return this.httpClient.put<Child>(`${this.baseUrl}/${id}/check-in`, { checkedIn });
	}

	// Independiente de setCheckedIn — retiro del niño y entrega de comida son dos acciones
	// separadas (ver scan.ts).
	setMealDelivered(id: number, delivered: boolean): Observable<Child> {
		return this.httpClient.put<Child>(`${this.baseUrl}/${id}/meal-delivered`, { delivered });
	}

	deleteChild(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
