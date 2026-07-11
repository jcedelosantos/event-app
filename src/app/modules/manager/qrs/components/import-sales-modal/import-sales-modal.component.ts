import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { QRService, BulkImportResult, BulkImportSaleTicketRow } from '../../services/qr.service';
import { Events } from '../../../../../models/events/events';
import { Ticket } from '../../../../../models/tickets/ticket';
import { EventsService } from '../../../events/services/events.service';
import { TicketsService } from '../../../tickets/services/tickets.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { parseCsv, pickColumn } from '../../../../../utils/csv';

@Component({
	selector: 'import-sales-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="importSalesModal" tabindex="-1" aria-labelledby="importSalesModalLabel" aria-hidden="true">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="importSalesModalLabel">Importar clientes / ventas desde CSV</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" (click)="reset()"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Evento *</label>
									<select class="custom-select d-block w-100" formControlName="eventId" (change)="onEventChange()">
										<option [ngValue]="null">Elegí...</option>
										@for (event of events(); track event.id) {
											<option [ngValue]="event.id">{{ event.name }}</option>
										}
									</select>
								</div>
								<div class="col-md-6 mb-3">
									<label>Tipo de ticket *</label>
									<select class="custom-select d-block w-100" formControlName="ticketId">
										<option [ngValue]="null">Elegí...</option>
										@for (ticket of tickets(); track ticket.id) {
											<option [ngValue]="ticket.id">{{ ticket.name }} — {{ ticket.type }}</option>
										}
									</select>
									@if (form.controls.eventId.value && !tickets().length) {
										<div class="form-text">Este evento todavía no tiene tickets creados.</div>
									}
								</div>
							</div>
							<div class="mb-3">
								<label>Archivo CSV *</label>
								<input type="file" class="form-control" accept=".csv,text/csv" (change)="onFileSelected($event)" />
								<div class="form-text">
									Columnas esperadas (nombres flexibles): CARNET, NOMBRE (CLIENTE), CORREO, MESA, SILLA, PAGO. El asiento se arma como
									"Mesa {{ '{' }}MESA{{ '}' }}-{{ '{' }}SILLA{{ '}' }}" y tiene que existir en el mapa del evento.
								</div>
							</div>

							@if (parsedRows().length) {
								<div class="alert alert-secondary">
									Se detectaron <strong>{{ parsedRows().length }}</strong> fila(s) listas para importar. Vista previa de las primeras 5:
									<table class="table table-sm table-dark mt-2 mb-0">
										<thead>
											<tr>
												<th>Nombre</th>
												<th>Carnet</th>
												<th>Correo</th>
												<th>Asiento</th>
												<th>Pago</th>
											</tr>
										</thead>
										<tbody>
											@for (row of parsedRows().slice(0, 5); track $index) {
												<tr>
													<td>{{ row.name }}</td>
													<td>{{ row.carnet || '—' }}</td>
													<td>{{ row.email || '—' }}</td>
													<td>{{ row.seatName }}</td>
													<td>{{ row.paidType }}</td>
												</tr>
											}
										</tbody>
									</table>
								</div>
							}

							@if (parseError()) {
								<div class="text-danger">{{ parseError() }}</div>
							}
							@if (errorMessage()) {
								<div class="text-danger">{{ errorMessage() }}</div>
							}

							@if (result(); as r) {
								<div class="alert" [class.alert-success]="!r.skipped.length" [class.alert-warning]="r.skipped.length">
									Se crearon <strong>{{ r.created }}</strong> venta(s).
									@if (r.skipped.length) {
										<div class="mt-2">{{ r.skipped.length }} fila(s) con problemas:</div>
										<ul class="mb-0 small">
											@for (s of r.skipped; track $index) {
												<li>Fila {{ s.row }}: {{ s.reason }}</li>
											}
										</ul>
									}
								</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal" (click)="reset()">Cerrar</button>
						<button type="button" class="btn btn-danger" [disabled]="!canImport() || importing()" (click)="submit()">
							{{ importing() ? 'Importando...' : 'Importar ' + parsedRows().length + ' fila(s)' }}
						</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportSalesModalComponent implements OnInit {
	private readonly fb = inject(FormBuilder);
	private readonly qrService = inject(QRService);
	private readonly eventsService = inject(EventsService);
	private readonly ticketsService = inject(TicketsService);

	imported = output<number>();

	events = signal<Events[]>([]);
	tickets = signal<Ticket[]>([]);
	parsedRows = signal<BulkImportSaleTicketRow[]>([]);
	parseError = signal('');
	errorMessage = signal('');
	result = signal<BulkImportResult | null>(null);
	importing = signal(false);

	form = this.fb.group({
		eventId: this.fb.control<number | null>(null, Validators.required),
		ticketId: this.fb.control<number | null>(null, Validators.required),
	});

	canImport = () => this.form.valid && this.parsedRows().length > 0;

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
	}

	onEventChange() {
		const eventId = this.form.controls.eventId.value;
		this.tickets.set([]);
		this.form.patchValue({ ticketId: null });
		if (!eventId) return;
		this.ticketsService.getTicketsByEvent(eventId).subscribe((tickets) => this.tickets.set(tickets));
	}

	onFileSelected(event: Event) {
		this.parseError.set('');
		this.result.set(null);
		this.errorMessage.set('');
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) {
			this.parsedRows.set([]);
			return;
		}

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const text = String(reader.result ?? '');
				const csvRows = parseCsv(text);
				if (!csvRows.length) {
					this.parseError.set('El archivo no tiene filas de datos (¿le falta el header?).');
					this.parsedRows.set([]);
					return;
				}
				const rows: BulkImportSaleTicketRow[] = csvRows
					.map((row) => {
						const mesa = pickColumn(row, 'MESA', 'mesa', 'table');
						const silla = pickColumn(row, 'SILLA', 'silla', 'asiento', 'seat');
						return {
							carnet: pickColumn(row, 'CARNET', 'carnet', 'ID'),
							name: pickColumn(row, 'NOMBRE CLIENTE', 'NOMBRE', 'nombre', 'name'),
							lastname: pickColumn(row, 'APELLIDO', 'lastname'),
							email: pickColumn(row, 'CORREO', 'EMAIL', 'correo', 'email'),
							phone: pickColumn(row, 'TELEFONO', 'PHONE', 'telefono', 'phone'),
							seatName: mesa && silla ? `Mesa ${mesa}-${silla}` : pickColumn(row, 'ASIENTO', 'seatName'),
							paidType: pickColumn(row, 'PAGO', 'PAID TYPE', 'pago', 'paidType') || 'Efectivo',
						};
					})
					.filter((row) => row.name && row.seatName);

				if (!rows.length) {
					this.parseError.set('No se pudo leer ninguna fila válida — revisá que el CSV tenga columnas de nombre, mesa y silla.');
				}
				this.parsedRows.set(rows);
			} catch {
				this.parseError.set('No se pudo leer el archivo. Verificá que sea un CSV válido.');
				this.parsedRows.set([]);
			}
		};
		reader.readAsText(file);
	}

	submit() {
		if (!this.canImport()) return;
		const { eventId, ticketId } = this.form.getRawValue();
		this.importing.set(true);
		this.errorMessage.set('');
		this.result.set(null);
		this.qrService.bulkImport({ eventId: eventId!, ticketId: ticketId!, rows: this.parsedRows() }).subscribe({
			next: (result) => {
				this.result.set(result);
				this.importing.set(false);
				this.imported.emit(result.created);
			},
			error: (err: HttpErrorResponse) => {
				this.importing.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}

	reset() {
		this.form.reset({ eventId: null, ticketId: null });
		this.tickets.set([]);
		this.parsedRows.set([]);
		this.parseError.set('');
		this.errorMessage.set('');
		this.result.set(null);
	}
}
