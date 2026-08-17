import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PendingReceiptTenant, SignupEventAdminService } from '../../services/signup-event-admin.service';
import { EVENT_PLANS } from '../../../../shared/event-plans';
import { extractErrorMessage } from '../../../../utils/api-error';
import { closeModal } from '../../../../utils/modal';
import { centsToDollars } from '../../../../shared/money';

@Component({
	selector: 'app-bank-transfer-review-modal',
	template: `<div class="modal fade" id="bankTransferReviewModal" tabindex="-1" aria-labelledby="bankTransferReviewModalLabel" aria-hidden="true">
		<div class="modal-dialog modal-lg">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="bankTransferReviewModalLabel">Comprobante — {{ tenant()?.name }}</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
				</div>
				<div class="modal-body">
					@if (tenant(); as t) {
						<p class="text-muted small mb-3">{{ tierName(t.plan) }} — USD {{ tierPrice(t.plan) }}</p>
						@if (t.paymentReceiptUrl) {
							<img [src]="t.paymentReceiptUrl" alt="Comprobante de transferencia" class="img-fluid rounded border border-secondary-subtle" />
						} @else {
							<p class="text-danger small">No se encontró la imagen del comprobante.</p>
						}
					}
					@if (errorMessage) {
						<div class="text-danger mt-3">{{ errorMessage }}</div>
					}
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-outline-danger btn-sm" [disabled]="submitting()" (click)="review(false)">
						<i class="bi bi-x-lg"></i> Rechazar
					</button>
					<button type="button" class="btn btn-success btn-sm" [disabled]="submitting()" (click)="review(true)">
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
export class BankTransferReviewModalComponent {
	private readonly signupEventAdminSrv = inject(SignupEventAdminService);

	tenant = model<PendingReceiptTenant | null>(null);
	reviewed = output<void>();
	errorMessage = '';
	submitting = signal(false);

	tierName(plan: string): string {
		return EVENT_PLANS.find((t) => t.code === plan)?.name ?? plan;
	}

	// Devuelve dólares (no centavos) — se muestra directo en el template.
	tierPrice(plan: string): number {
		return centsToDollars(EVENT_PLANS.find((t) => t.code === plan)?.priceCents ?? 0);
	}

	review(approve: boolean) {
		const current = this.tenant();
		if (!current) return;
		this.errorMessage = '';
		this.submitting.set(true);
		this.signupEventAdminSrv.review(current.id, approve).subscribe({
			next: () => {
				this.submitting.set(false);
				this.reviewed.emit();
				this.tenant.set(null);
				closeModal('bankTransferReviewModal');
			},
			error: (err: HttpErrorResponse) => {
				this.submitting.set(false);
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
