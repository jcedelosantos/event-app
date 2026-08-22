import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
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
	// Precio unitario CONGELADO al momento de esta venta, en centavos enteros — usar esto (×
	// quantity) para ingresos históricos, NUNCA product.priceCents (ese es el precio ACTUAL, puede
	// haber cambiado desde entonces). null = venta de antes de este campo (ver
	// SaleProduct.unitPriceCents en la API).
	unitPriceCents: number | null;
	// Mismo ciclo de pago que SaleTicket (ver qr.service.ts) — habilita pagar productos desde el
	// checkout público del evento, no solo por venta manual del manager.
	paymentStatus: 'PAID' | 'PENDING';
	paymentProvider: 'PAYPAL' | 'LINK' | null;
	paymentReceiptUrl: string | null;
	channel: 'MANUAL' | 'PUBLIC';
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

	// Historial COMPLETO sin acotar — dashboard depende de esto para sumar ingresos totales
	// correctos, no lo cambies a la vista acotada (ver getRecentSaleProducts()).
	getSaleProducts(): Observable<SaleProduct[]> {
		return this.httpClient.get<SaleProduct[]>(this.baseUrl);
	}

	// Vista acotada a las 500 ventas más recientes de TODOS los eventos (ver ?recent=1 en
	// sale-products.ts), para la tabla navegable del panel de QRs.
	getRecentSaleProducts(): Observable<{ items: SaleProduct[]; totalCount: number | null }> {
		return this.httpClient
			.get<SaleProduct[]>(this.baseUrl, { params: { recent: 1 }, observe: 'response' })
			.pipe(map((res) => ({ items: res.body ?? [], totalCount: parseTotalCount(res.headers.get('X-Total-Count')) })));
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

	// Confirmación manual de pago (Opción "Link") — mismo patrón que qr.service.ts markPaid.
	markPaid(id: number, paidType: string): Observable<SaleProduct> {
		return this.httpClient.put<SaleProduct>(`${this.baseUrl}/${id}/mark-paid`, { paidType });
	}

	// Deshace un "Marcar como pagado" hecho por error — vuelve a Pendiente sin devolver el stock.
	markPending(id: number): Observable<SaleProduct> {
		return this.httpClient.put<SaleProduct>(`${this.baseUrl}/${id}/mark-pending`, {});
	}
}

function parseTotalCount(value: string | null): number | null {
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}
