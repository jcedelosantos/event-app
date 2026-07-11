import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Product } from '../../../../models/products/product';
import { environment } from '../../../../../environments/environment';

export type ProductInput = {
	name: string;
	img?: string;
	description?: string;
	type: string;
	variant?: string;
	count: number;
	active?: boolean;
	price: number;
	eventId: number;
};

export type BulkImportProductRow = {
	name: string;
	description: string;
	type: string;
	variant: string;
	count: number;
	price: number;
	img: string;
};

export type BulkImportProductsInput = {
	eventId: number;
	rows: BulkImportProductRow[];
};

export type BulkImportResult = {
	created: number;
	skipped: { row: number; reason: string }[];
};

@Injectable({
	providedIn: 'root',
})
export class ProductsService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/products`;

	getProducts(): Observable<Product[]> {
		return this.httpClient.get<Product[]>(this.baseUrl);
	}

	getProductsByEvent(eventId: number): Observable<Product[]> {
		return this.httpClient.get<Product[]>(this.baseUrl, { params: { eventId } });
	}

	createProduct(product: ProductInput): Observable<Product> {
		return this.httpClient.post<Product>(this.baseUrl, product);
	}

	updateProduct(id: number, product: Partial<ProductInput>): Observable<Product> {
		return this.httpClient.put<Product>(`${this.baseUrl}/${id}`, product);
	}

	deleteProduct(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}

	bulkImport(input: BulkImportProductsInput): Observable<BulkImportResult> {
		return this.httpClient.post<BulkImportResult>(`${this.baseUrl}/bulk-import`, input);
	}
}
