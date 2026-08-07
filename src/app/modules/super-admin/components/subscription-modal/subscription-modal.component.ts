import { ChangeDetectionStrategy, Component, effect, inject, model, output, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { TenantService, TenantSubscriptionDetail } from '../../services/tenant.service';
import { Tenant } from '../../../../models/tenants/tenant';
import { extractErrorMessage } from '../../../../utils/api-error';
import { confirm, error as showError } from '../../../../utils/messages';

const STATUS_LABEL: Record<string, string> = {
	PENDING: 'Pendiente de pago',
	ACTIVE: 'Activa',
	PAST_DUE: 'Pago vencido',
	SUSPENDED: 'Suspendida',
	CANCELLED: 'Cancelada',
};

@Component({
	selector: 'app-subscription-modal',
	imports: [DatePipe, DecimalPipe],
	template: `
		<div class="modal fade" id="subscriptionModal" tabindex="-1" aria-labelledby="subscriptionModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="subscriptionModalLabel">Suscripción — {{ tenant()?.name }}</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						@if (detail(); as d) {
							@if (d.subscription; as sub) {
								<dl class="row small mb-3">
									<dt class="col-5">Plan</dt>
									<dd class="col-7">{{ sub.plan }}</dd>
									<dt class="col-5">Estado</dt>
									<dd class="col-7">
										<span class="badge" [class.text-bg-success]="sub.status === 'ACTIVE'" [class.text-bg-warning]="sub.status === 'PAST_DUE' || sub.status === 'PENDING'" [class.text-bg-secondary]="sub.status === 'SUSPENDED' || sub.status === 'CANCELLED'">
											{{ statusLabel(sub.status) }}
										</span>
									</dd>
									<dt class="col-5">Próxima renovación</dt>
									<dd class="col-7">{{ sub.currentPeriodEnd ? (sub.currentPeriodEnd | date: 'medium') : '—' }}</dd>
									<dt class="col-5">PayPal Subscription ID</dt>
									<dd class="col-7 text-muted small">{{ sub.paypalSubscriptionId ?? '—' }}</dd>
								</dl>

								<hr />
								<h2 class="fs-6">Overage pendiente de facturar</h2>
								@if (!d.overage.events.length) {
									<p class="text-muted small">Ningún evento superó el cupo de asistentes de su plan.</p>
								} @else {
									<table class="table table-sm">
										<thead>
											<tr>
												<th>Evento</th>
												<th class="text-end">Vendidos</th>
												<th class="text-end">Incluidos</th>
												<th class="text-end">Exceso</th>
												<th class="text-end">USD</th>
											</tr>
										</thead>
										<tbody>
											@for (ev of d.overage.events; track ev.eventId) {
												<tr>
													<td>{{ ev.eventName }}</td>
													<td class="text-end">{{ ev.soldCount }}</td>
													<td class="text-end">{{ ev.included }}</td>
													<td class="text-end">{{ ev.overageCount }}</td>
													<td class="text-end">{{ ev.overageUSD | number: '1.2-2' }}</td>
												</tr>
											}
										</tbody>
										<tfoot>
											<tr class="fw-bold">
												<td colspan="4" class="text-end">Total a facturar aparte</td>
												<td class="text-end">$ {{ d.overage.totalUSD | number: '1.2-2' }}</td>
											</tr>
										</tfoot>
									</table>
									<p class="text-muted small mb-0">No se cobra automático — PayPal Subscriptions no soporta montos variables sin permisos de Reference Transactions.</p>
								}
							} @else {
								<p class="text-muted">Este tenant no tiene una suscripción propia (dado de alta a mano).</p>
							}
						} @else {
							<p class="text-muted">Cargando...</p>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
						@if (detail()?.subscription) {
							<button type="button" class="btn btn-outline-light" [disabled]="downloadingInvoice()" (click)="downloadInvoice()">
								{{ downloadingInvoice() ? 'Generando...' : 'Descargar factura' }}
							</button>
						}
						@if (detail()?.subscription?.paypalSubscriptionId) {
							<button type="button" class="btn btn-outline-danger" (click)="cancel()">Cancelar suscripción</button>
						}
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionModalComponent {
	private readonly tenantService = inject(TenantService);

	tenant = model.required<Tenant | null>();
	subscriptionChanged = output<void>();
	detail = signal<TenantSubscriptionDetail | null>(null);
	downloadingInvoice = signal(false);

	constructor() {
		effect(() => {
			const current = this.tenant();
			this.detail.set(null);
			if (!current) return;
			this.tenantService.getSubscription(current.id).subscribe((d) => this.detail.set(d));
		});
	}

	statusLabel(status: string): string {
		return STATUS_LABEL[status] ?? status;
	}

	downloadInvoice() {
		const current = this.tenant();
		if (!current) return;
		this.downloadingInvoice.set(true);
		this.tenantService.downloadInvoice(current.id).subscribe({
			next: (blob) => {
				this.downloadingInvoice.set(false);
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `factura-${current.slug}.pdf`;
				a.click();
				URL.revokeObjectURL(url);
			},
			error: (err: HttpErrorResponse) => {
				this.downloadingInvoice.set(false);
				showError(extractErrorMessage(err));
			},
		});
	}

	cancel() {
		const current = this.tenant();
		if (!current) return;
		confirm(`¿Cancelar la suscripción de "${current.name}"? El acceso se corta cuando PayPal confirme la cancelación.`, {
			onConfirm: () =>
				this.tenantService.cancelSubscription(current.id).subscribe({
					next: () => this.subscriptionChanged.emit(),
					error: (err: HttpErrorResponse) => showError(extractErrorMessage(err)),
				}),
		});
	}
}
