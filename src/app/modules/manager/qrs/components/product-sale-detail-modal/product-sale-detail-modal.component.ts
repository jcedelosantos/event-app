import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { HttpErrorResponse } from '@angular/common/http';
import { ProductSalesService, SaleProduct } from '../../services/product-sales.service';
import { extractErrorMessage } from '../../../../../utils/api-error';

@Component({
	selector: 'app-product-sale-detail-modal',
	imports: [DatePipe, QRCodeComponent],
	template: `
		<div class="modal fade" id="productSaleDetailModal" tabindex="-1" aria-labelledby="productSaleDetailModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="productSaleDetailModalLabel">{{ saleProduct()?.event?.name }}</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						@if (saleProduct(); as detail) {
							<div class="text-center mb-3">
								<qrcode [qrdata]="detail.codeQR" [width]="180" [errorCorrectionLevel]="'M'"></qrcode>
								<div class="input-group input-group-sm mt-2 mx-auto" style="max-width: 260px">
									<input type="text" class="form-control font-monospace" readonly [value]="detail.codeQR" title="Código para pegar en el scanner si la cámara falla" />
									<button type="button" class="btn btn-outline-secondary" (click)="copyCode(detail.codeQR)">
										<i class="bi" [class.bi-clipboard]="!codeCopied()" [class.bi-clipboard-check]="codeCopied()" aria-hidden="true"></i>
									</button>
								</div>
								<div class="mt-2">
									@if (detail.deliveredAt) {
										<span class="badge text-bg-success">Entregado el {{ detail.deliveredAt | date: 'short' }}</span>
									} @else {
										<span class="badge text-bg-secondary">Sin entregar todavía</span>
									}
								</div>
							</div>
							<div class="row">
								<div class="col-6 mb-2"><strong>Producto:</strong> {{ detail.product.name }}</div>
								<div class="col-6 mb-2"><strong>Cantidad:</strong> {{ detail.quantity }}</div>
								<div class="col-6 mb-2"><strong>Cliente:</strong> {{ detail.client.name }} {{ detail.client.lastname }}</div>
								<div class="col-6 mb-2"><strong>Email:</strong> {{ detail.client.email }}</div>
								<div class="col-6 mb-2"><strong>Vendido:</strong> {{ detail.dateSold | date: 'short' }}</div>
							</div>
							@if (resendMessage()) {
								<div class="alert" [class.alert-success]="resendOk()" [class.alert-danger]="!resendOk()">{{ resendMessage() }}</div>
							}
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-outline-danger" [disabled]="resending()" (click)="resend()"><i class="bi bi-envelope"></i> Reenviar por correo</button>
						<button type="button" class="btn btn-danger" data-bs-dismiss="modal">Close</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductSaleDetailModalComponent {
	private readonly productSalesService = inject(ProductSalesService);

	saleProduct = input<SaleProduct | null>(null);

	resending = signal(false);
	resendMessage = signal('');
	resendOk = signal(false);
	codeCopied = signal(false);

	// Mismo motivo que en event-detail-modal.component.ts: el scanner cae a un campo de código manual
	// si la cámara falla, y sin esto no había forma de conseguir ese texto — solo existía adentro de
	// la imagen del QR.
	copyCode(code: string) {
		navigator.clipboard.writeText(code).then(() => {
			this.codeCopied.set(true);
			setTimeout(() => this.codeCopied.set(false), 2000);
		});
	}

	resend() {
		const detail = this.saleProduct();
		if (!detail) return;

		this.resending.set(true);
		this.resendMessage.set('');
		this.productSalesService.resendSaleProduct(detail.id).subscribe({
			next: () => {
				this.resending.set(false);
				this.resendOk.set(true);
				this.resendMessage.set(`Correo reenviado a ${detail.client.email}.`);
			},
			error: (err: HttpErrorResponse) => {
				this.resending.set(false);
				this.resendOk.set(false);
				this.resendMessage.set(extractErrorMessage(err));
			},
		});
	}
}
