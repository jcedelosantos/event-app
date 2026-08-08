import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { SaleTicket } from './qr.service';
import { SaleProduct } from './product-sales.service';
import { Child } from './children.service';

export type ScanResult =
	| { type: 'ticket'; ok: true; saleTicket: SaleTicket }
	| { type: 'product'; ok: true; saleProduct: SaleProduct }
	// Talón familiar (tenants CHURCH) — un escaneo entrega a TODOS los hermanos pendientes de una
	// vez (ver api/src/routes/scan.ts), por eso viene como lista en vez de un solo Child.
	| { type: 'child'; ok: true; children: Child[] };

@Injectable({
	providedIn: 'root',
})
export class ScanService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/scan`;

	// mode solo importa cuando el código escaneado resuelve a un talón familiar (Child) — retiro del
	// niño y entrega de comida son acciones independientes (ver api/src/routes/scan.ts); se ignora
	// para tickets/productos. accessPointId es opcional — sin puertas configuradas para el evento,
	// el backend deja pasar cualquier ticket igual que siempre (ver AccessPoint en schema.prisma).
	scan(codeQR: string, mode?: 'pickup' | 'meal', accessPointId?: number | null): Observable<ScanResult> {
		return this.httpClient.post<ScanResult>(this.baseUrl, { codeQR, mode, accessPointId });
	}
}
