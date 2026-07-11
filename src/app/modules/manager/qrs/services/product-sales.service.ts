import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Events } from '../../../../models/events/events';
import { Product } from '../../../../models/products/product';
import { User } from '../../../../models/users/user';
import { environment } from '../../../../../environments/environment';

export type SaleProduct = {
	id: number;
	quantity: number;
	description: string;
	dateSold: string;
	paidType: string;
	codeQR: string;
	deliveredAt: string | null;
	eventId: number;
	productId: number;
	clientId: number;
	event: Events;
	product: Product;
	client: User;
	seller: User;
};

export type SaleProductInput = {
	eventId: number;
	productId: number;
	clientId: number;
	paidType: string;
	quantity?: number;
	description?: string;
};

@Injectable({
	providedIn: 'root',
})
export class ProductSalesService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/sale-products`;

	getSaleProducts(): Observable<SaleProduct[]> {
		return this.httpClient.get<SaleProduct[]>(this.baseUrl);
	}

	getSaleProductsByEvent(eventId: number): Observable<SaleProduct[]> {
		return this.httpClient.get<SaleProduct[]>(this.baseUrl, { params: { eventId } });
	}

	createSaleProduct(saleProduct: SaleProductInput): Observable<SaleProduct> {
		return this.httpClient.post<SaleProduct>(this.baseUrl, saleProduct);
	}

	deleteSaleProduct(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}

	resendSaleProduct(id: number): Observable<{ ok: boolean }> {
		return this.httpClient.post<{ ok: boolean }>(`${this.baseUrl}/${id}/resend`, {});
	}
}
