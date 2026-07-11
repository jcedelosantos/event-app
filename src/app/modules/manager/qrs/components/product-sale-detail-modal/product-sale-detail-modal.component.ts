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
