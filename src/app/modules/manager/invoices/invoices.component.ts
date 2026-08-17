import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Invoice } from '../../../models/invoices/invoice';
import { InvoicesService } from './services/invoices.service';
import { centsToDollars } from '../../../shared/money';

@Component({
	selector: 'app-invoices',
	imports: [DatePipe, DecimalPipe],
	template: `
		<h2 class="section-title">Facturas</h2>
		<p class="text-body-secondary small">
			Facturas emitidas por INTEG por tu suscripción — el Super Admin las genera (a mano o automáticamente el día 1 de cada mes); acá solo las consultas y descargas.
		</p>

		@if (loading()) {
			<p class="text-body-secondary">Cargando...</p>
		} @else {
			<table class="table table-striped table-hover table-sm align-middle">
				<thead>
					<tr>
						<th>Período</th>
						<th>N° factura</th>
						<th>Comprobante</th>
						<th class="text-end">Total</th>
						<th>Fecha</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					@for (invoice of invoices(); track invoice.id) {
						<tr>
							<td>{{ invoice.billingPeriod }}</td>
							<td class="text-muted">{{ invoice.invoiceNumber }}</td>
							<td class="text-muted">{{ invoice.ncf ?? '—' }}</td>
							<td class="text-end">USD {{ centsToDollars(invoice.totalCents) | number: '1.2-2' }}</td>
							<td class="text-muted text-nowrap">{{ invoice.createdAt | date: 'short' }}</td>
							<td class="text-end">
								<a class="btn btn-sm btn-outline-light" [href]="invoice.pdfUrl ?? ''" target="_blank" rel="noopener">
									<i class="bi bi-download"></i> Descargar
								</a>
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="6" class="text-center text-muted py-4">Todavía no hay facturas emitidas.</td>
						</tr>
					}
				</tbody>
			</table>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesComponent implements OnInit {
	private readonly invoicesService = inject(InvoicesService);

	invoices = signal<Invoice[]>([]);
	loading = signal(true);
	readonly centsToDollars = centsToDollars;

	ngOnInit(): void {
		this.invoicesService.getMine().subscribe((invoices) => {
			this.invoices.set(invoices);
			this.loading.set(false);
		});
	}
}
