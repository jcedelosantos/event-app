import { ChangeDetectionStrategy, Component, inject, Input, OnChanges, SimpleChanges, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { Table } from '../../../../../models/maps/table';
import { Seat } from '../../../../../models/maps/seat';
import { TablesService } from '../../services/tables.service';
import { SeatsService } from '../../services/seats.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'bulk-edit-tables-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="bulkEditTablesModal" tabindex="-1" aria-labelledby="bulkEditTablesModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="bulkEditTablesModalLabel">Editar tamaño de mesas</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Tamaño del ícono de mesa (px) *</label>
									<input type="number" class="form-control" [class.is-invalid]="isInvalid('tableSize')" formControlName="tableSize" />
									@if (isInvalid('tableSize')) {
										<div class="invalid-feedback">Ingresá un tamaño entre 8 y 200.</div>
									}
								</div>
								<div class="col-md-6 mb-3">
									<label>Tamaño de sus asientos (px) <span class="text-muted">(opcional)</span></label>
									<input type="number" class="form-control" [class.is-invalid]="isInvalid('seatSize')" formControlName="seatSize" placeholder="Dejar vacío para no tocarlos" />
									@if (isInvalid('seatSize')) {
										<div class="invalid-feedback">Entre 4 y 100.</div>
									}
								</div>
							</div>
							<div class="d-flex justify-content-between align-items-center mb-2">
								<label class="mb-0">Mesas a editar ({{ selected().size }} de {{ tables.length }})</label>
								<div>
									<button type="button" class="btn btn-link btn-sm p-0 me-3" (click)="selectAll()">Elegir todas</button>
									<button type="button" class="btn btn-link btn-sm p-0" (click)="selectNone()">Ninguna</button>
								</div>
							</div>
							<div class="table-checklist mb-2">
								@for (table of tables; track table.id) {
									<div class="form-check">
										<input class="form-check-input" type="checkbox" [id]="'tbl-' + table.id" [checked]="selected().has(table.id)" (change)="toggle(table.id)" />
										<label class="form-check-label" [for]="'tbl-' + table.id">{{ table.name }} <span class="text-muted">({{ table.seats.length }} asientos)</span></label>
									</div>
								} @empty {
									<p class="text-muted small">Esta área todavía no tiene mesas.</p>
								}
							</div>
							@if (errorMessage) {
								<div class="text-danger mt-2">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" [disabled]="applying || !selected().size" (click)="submit()">Aplicar</button>
					</div>
				</div>
			</div>
		</div>
	`,
	styles: [
		`
			.table-checklist {
				max-height: 240px;
				overflow-y: auto;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkEditTablesModalComponent implements OnChanges {
	private readonly fb = inject(FormBuilder);
	private readonly tablesService = inject(TablesService);
	private readonly seatsService = inject(SeatsService);

	@Input() tables: Table[] = [];
	tablesUpdated = output<Table[]>();
	seatsUpdated = output<Seat[]>();

	selected = signal<Set<number>>(new Set());
	errorMessage = '';
	applying = false;

	form = this.fb.group({
		tableSize: this.fb.control<number | null>(null, [Validators.required, Validators.min(8), Validators.max(200)]),
		seatSize: this.fb.control<number | null>(null, [Validators.min(4), Validators.max(100)]),
	});

	// Cada vez que cambia la lista de mesas del área (se abre el modal sobre una nueva área, o se
	// generan/borran mesas), arranca con todas seleccionadas — es el caso de uso más común ("cambiar
	// el tamaño de todas") y de ahí se puede destildar lo que no aplique.
	ngOnChanges(changes: SimpleChanges) {
		if (changes['tables']) {
			this.selected.set(new Set(this.tables.map((t) => t.id)));
		}
	}

	isInvalid(name: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[name];
		return control.invalid && control.touched;
	}

	selectAll() {
		this.selected.set(new Set(this.tables.map((t) => t.id)));
	}

	selectNone() {
		this.selected.set(new Set());
	}

	toggle(id: number) {
		this.selected.update((set) => {
			const next = new Set(set);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	submit() {
		if (this.form.invalid || !this.selected().size) {
			this.form.markAllAsTouched();
			return;
		}

		const { tableSize, seatSize } = this.form.getRawValue();
		const targetTables = this.tables.filter((t) => this.selected().has(t.id));

		this.applying = true;
		const tableRequests = targetTables.map((t) => this.tablesService.updateTable(t.id, { size: tableSize! }));
		forkJoin(tableRequests).subscribe({
			next: (updatedTables) => {
				this.tablesUpdated.emit(updatedTables);
				if (seatSize) {
					const seatRequests = targetTables.flatMap((t) => t.seats.map((s) => this.seatsService.updateSeat(s.id, { size: seatSize })));
					if (seatRequests.length) {
						forkJoin(seatRequests).subscribe({
							next: (updatedSeats) => {
								this.seatsUpdated.emit(updatedSeats);
								this.finish();
							},
							error: (err: HttpErrorResponse) => this.fail(err),
						});
						return;
					}
				}
				this.finish();
			},
			error: (err: HttpErrorResponse) => this.fail(err),
		});
	}

	private finish() {
		this.applying = false;
		this.errorMessage = '';
		closeModal('bulkEditTablesModal');
	}

	private fail(err: HttpErrorResponse) {
		this.applying = false;
		this.errorMessage = extractErrorMessage(err);
	}
}
