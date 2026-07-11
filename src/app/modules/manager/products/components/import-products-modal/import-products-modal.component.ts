import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ProductsService, BulkImportResult, BulkImportProductRow } from '../../services/products.service';
import { Events } from '../../../../../models/events/events';
import { EventsService } from '../../../events/services/events.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { parseCsv, pickColumn } from '../../../../../utils/csv';

@Component({
	selector: 'import-products-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="importProductsModal" tabindex="-1" aria-labelledby="importProductsModalLabel" aria-hidden="true">
			<div class="modal-dialog modal-lg">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="importProductsModalLabel">Importar productos desde CSV</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" (click)="reset()"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="mb-3">
								<label>Evento *</label>
								<select class="custom-select d-block w-100" formControlName="eventId">
									<option [ngValue]="null">Elegí...</option>
									@for (event of events(); track event.id) {
										<option [ngValue]="event.id">{{ event.name }}</option>
									}
								</select>
							</div>
							<div class="mb-3">
								<label>Archivo CSV *</label>
								<input type="file" class="form-control" accept=".csv,text/csv" (change)="onFileSelected($event)" />
								<div class="form-text">Columnas esperadas (nombres flexibles): NOMBRE, DESCRIPCION, TIPO, VARIANTE, CANTIDAD, PRECIO.</div>
							</div>

							@if (parsedRows().length) {
								<div class="alert alert-secondary">
									Se detectaron <strong>{{ parsedRows().length }}</strong> fila(s) listas para importar. Vista previa de las primeras 5:
									<table class="table table-sm table-dark mt-2 mb-0">
										<thead>
											<tr>
												<th>Nombre</th>
												<th>Tipo</th>
												<th>Variante</th>
												<th>Cantidad</th>
												<th>Precio</th>
											</tr>
										</thead>
										<tbody>
											@for (row of parsedRows().slice(0, 5); track $index) {
												<tr>
													<td>{{ row.name }}</td>
													<td>{{ row.type || '—' }}</td>
													<td>{{ row.variant || '—' }}</td>
													<td>{{ row.count }}</td>
													<td>{{ row.price }}</td>
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
									Se crearon <strong>{{ r.created }}</strong> producto(s).
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
export class ImportProductsModalComponent implements OnInit {
	private readonly fb = inject(FormBuilder);
	private readonly productsService = inject(ProductsService);
	private readonly eventsService = inject(EventsService);

	imported = output<number>();

	events = signal<Events[]>([]);
	parsedRows = signal<BulkImportProductRow[]>([]);
	parseError = signal('');
	errorMessage = signal('');
	result = signal<BulkImportResult | null>(null);
	importing = signal(false);

	form = this.fb.group({
		eventId: this.fb.control<number | null>(null, Validators.required),
	});

	canImport = () => this.form.valid && this.parsedRows().length > 0;

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
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
				const rows: BulkImportProductRow[] = csvRows
					.map((row) => ({
						name: pickColumn(row, 'NOMBRE', 'nombre', 'name'),
						description: pickColumn(row, 'DESCRIPCION', 'descripción', 'description'),
						type: pickColumn(row, 'TIPO', 'tipo', 'type'),
						variant: pickColumn(row, 'VARIANTE', 'variante', 'variant'),
						count: Number(pickColumn(row, 'CANTIDAD', 'cantidad', 'count', 'stock')) || 0,
						price: Number(pickColumn(row, 'PRECIO', 'precio', 'price')) || 0,
						img: pickColumn(row, 'IMG', 'IMAGEN', 'img', 'image'),
					}))
					.filter((row) => row.name);

				if (!rows.length) {
					this.parseError.set('No se pudo leer ninguna fila válida — revisá que el CSV tenga una columna de nombre.');
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
		const { eventId } = this.form.getRawValue();
		this.importing.set(true);
		this.errorMessage.set('');
		this.result.set(null);
		this.productsService.bulkImport({ eventId: eventId!, rows: this.parsedRows() }).subscribe({
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
		this.form.reset({ eventId: null });
		this.parsedRows.set([]);
		this.parseError.set('');
		this.errorMessage.set('');
		this.result.set(null);
	}
}
