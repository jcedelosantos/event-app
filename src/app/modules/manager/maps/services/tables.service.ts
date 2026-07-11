import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Table } from '../../../../models/maps/table';
import { environment } from '../../../../../environments/environment';

export type TableInput = {
	name: string;
	icon?: string;
	type?: string;
	x?: number;
	y?: number;
	radio?: number;
	color?: string;
	size?: number;
	areaId: number;
};

@Injectable({ providedIn: 'root' })
export class TablesService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/tables`;

	getTablesByArea(areaId: number): Observable<Table[]> {
		return this.httpClient.get<Table[]>(this.baseUrl, { params: { areaId } });
	}

	createTable(table: TableInput): Observable<Table> {
		return this.httpClient.post<Table>(this.baseUrl, table);
	}

	updateTable(id: number, table: Partial<TableInput>): Observable<Table> {
		return this.httpClient.put<Table>(`${this.baseUrl}/${id}`, table);
	}

	deleteTable(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
