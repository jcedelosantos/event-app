import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { QRService, SaleTicket } from '../../services/qr.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { centsToDollars } from '../../../../../shared/money';
import { closeModal } from '../../../../../utils/modal';

// Mismo patrón que bank-transfer-review-modal.component.ts (Super Admin) — acá para confirmar el
// pago de un ticket vendido por transferencia (Opción "Link" con datos bancarios, ver
// public-event.component.ts) con el comprobante a la vista, en vez de confirmar "a ciegas" con el
// checkmark rápido de la tabla (que sigue existiendo para PayPal/ventas sin comprobante).
@Component({
	selector: 'app-receipt-review-modal',
	template: `<div class="modal fade" id="receiptReviewModal" tabindex="-1" aria-labelledby="receiptReviewModalLabel" aria-hidden="true">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="receiptReviewModalLabel">Comprobante — {{ qr()?.client?.name }} {{ qr()?.client?.lastname }}</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
				</div>
				<div class="modal-body">
					@if (qr(); as q) {
						<p class="text-muted small mb-3">
							{{ q.event.name }} — {{ q.ticket.name }}
							@if (q.priceCents) {
								— USD {{ centsToDollars(q.priceCents) }}
							}
						</p>
						@if (q.paymentReceiptUrl) {
							<img [src]="q.paymentReceiptUrl" alt="Comprobante de transferencia" class="img-fluid rounded border border-secondary-subtle" />
						} @else {
							<p class="text-danger small">No se encontró la imagen del comprobante.</p>
						}
					}
					@if (errorMessage) {
						<div class="text-danger mt-3">{{ errorMessage }}</div>
					}
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-outline-danger btn-sm" [disabled]="submitting()" (click)="reject()">
						<i class="bi bi-x-lg"></i> Rechazar
					</button>
					<button type="button" class="btn btn-success btn-sm" [disabled]="submitting()" (click)="confirm()">
						<i class="bi bi-check-lg"></i> Confirmar pago
					</button>
				</div>
			</div>
		</div>
	</div>`,
	styles: `
		img {
			max-height: 480px;
			width: auto;
			display: block;
			margin: 0 auto;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptReviewModalComponent {
	private readonly qrService = inject(QRService);
	readonly centsToDollars = centsToDollars;

	qr = model<SaleTicket | null>(null);
	// El padre reemplaza la fila con el ticket actualizado (pagado) o la saca de la lista (rechazado,
	// libera el asiento) — discriminado por type porque el rechazo no devuelve un SaleTicket completo
	// (deleteQR solo borra), así que el padre necesita el id a mano para sacarlo de la lista.
	reviewed = output<{ type: 'confirmed'; ticket: SaleTicket } | { type: 'rejected'; id: number }>();
	errorMessage = '';
	submitting = signal(false);

	// Ya sabemos que es transferencia (por eso hay foto) — a diferencia del checkmark rápido de la
	// tabla, acá no hace falta preguntar "¿cómo pagó?".
	confirm() {
		const current = this.qr();
		if (!current) return;
		this.errorMessage = '';
		this.submitting.set(true);
		this.qrService.markPaid(current.id, 'Transfer').subscribe({
			next: (updated) => {
				this.submitting.set(false);
				this.reviewed.emit({ type: 'confirmed', ticket: updated });
				this.qr.set(null);
				closeModal('receiptReviewModal');
			},
			error: (err: HttpErrorResponse) => {
				this.submitting.set(false);
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}

	// Un hold PENDING es solo una reserva sin plata confirmada de por medio (ver deleteQR en
	// qrs.component.ts) — "Rechazar" acá libera el asiento igual que "Liberar asiento" en la tabla,
	// para cuando el comprobante no es válido.
	reject() {
		const current = this.qr();
		if (!current) return;
		this.errorMessage = '';
		this.submitting.set(true);
		this.qrService.deleteQR(current.id).subscribe({
			next: () => {
				this.submitting.set(false);
				this.reviewed.emit({ type: 'rejected', id: current.id });
				this.qr.set(null);
				closeModal('receiptReviewModal');
			},
			error: (err: HttpErrorResponse) => {
				this.submitting.set(false);
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
