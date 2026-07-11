import { ChangeDetectionStrategy, Component, inject, Input, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { Seat } from '../../../../../models/maps/seat';
import { Table } from '../../../../../models/maps/table';
import { SeatsService } from '../../services/seats.service';
import { TablesService } from '../../services/tables.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'bulk-create-seats-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="bulkCreateSeatsModal" tabindex="-1" aria-labelledby="bulkCreateSeatsModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="bulkCreateSeatsModalLabel">Generar varios asientos / mesas</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="row">
								<div class="col-md-4 mb-3">
									<label>Cantidad *</label>
									<input type="number" class="form-control" [class.is-invalid]="isInvalid('count')" formControlName="count" />
									@if (isInvalid('count')) {
										<div class="invalid-feedback">Ingresá cuántos {{ form.controls.seatsPerTable.value ? 'mesas' : 'asientos' }} crear (entre 1 y 200).</div>
									}
								</div>
								<div class="col-md-4 mb-3">
									<label>Prefijo</label>
									<input type="text" class="form-control" formControlName="prefix" [placeholder]="form.controls.seatsPerTable.value ? 'Mesa' : 'A'" maxlength="10" />
								</div>
								<div class="col-md-4 mb-3">
									<label>Por fila</label>
									<input type="number" class="form-control" formControlName="columns" />
								</div>
							</div>
							<hr />
							<div class="row">
								<div class="col-md-6 mb-3">
									<label>Asientos por mesa <span class="text-muted">(vacío = asientos sueltos, sin agrupar)</span></label>
									<input type="number" class="form-control" formControlName="seatsPerTable" placeholder="ej. 10" />
								</div>
								<div class="col-md-6 mb-3">
									<label>Ícono de mesa</label>
									<select class="form-select" formControlName="tableIcon">
										<option value="bi-circle-fill">Mesa redonda</option>
										<option value="bi-square-fill">Mesa rectangular</option>
									</select>
								</div>
							</div>
							@if (form.controls.seatsPerTable.value) {
								<div class="form-text">
									Se crean {{ form.controls.count.value || 0 }} mesas ("{{ form.controls.prefix.value || 'Mesa' }} 1", "{{ form.controls.prefix.value || 'Mesa' }} 2"...) con
									{{ form.controls.seatsPerTable.value }} asientos cada una, acomodados en anillo alrededor del ícono de la mesa — cada asiento se vende por separado. Después
									podés arrastrar cada mesa (y cada asiento) para ajustar la posición exacta.
								</div>
							} @else {
								<div class="form-text">
									Se crean como "{{ form.controls.prefix.value || 'A' }}1", "{{ form.controls.prefix.value || 'A' }}2", etc., acomodados en una cuadrícula — después podés
									arrastrar cada uno para ajustar su posición exacta.
								</div>
							}
							@if (errorMessage) {
								<div class="text-danger mt-2">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" [disabled]="creating" (click)="submit()">Generar</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkCreateSeatsModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly seatsService = inject(SeatsService);
	private readonly tablesService = inject(TablesService);

	@Input() areaId: number | undefined;
	seatsCreated = output<Seat[]>();
	tablesCreated = output<Table[]>();
	errorMessage = '';
	creating = false;

	form = this.fb.group({
		count: this.fb.control<number | null>(null, [Validators.required, Validators.min(1), Validators.max(200)]),
		prefix: this.fb.control(''),
		columns: this.fb.control(10, [Validators.min(1)]),
		seatsPerTable: this.fb.control<number | null>(null, [Validators.min(1), Validators.max(30)]),
		tableIcon: this.fb.control('bi-circle-fill'),
	});

	isInvalid(name: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[name];
		return control.invalid && control.touched;
	}

	submit() {
		if (this.form.invalid || !this.areaId) {
			this.form.markAllAsTouched();
			return;
		}

		const { count, prefix, columns, seatsPerTable, tableIcon } = this.form.getRawValue();
		const cols = Math.max(1, columns ?? 10);

		if (seatsPerTable && seatsPerTable > 0) {
			this.generateTables(count!, prefix || 'Mesa', cols, seatsPerTable, tableIcon || 'bi-circle-fill');
		} else {
			this.generateFlatSeats(count!, prefix || 'A', cols);
		}
	}

	private generateFlatSeats(count: number, prefix: string, cols: number) {
		const spacing = 60;
		const requests = Array.from({ length: count }, (_, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			return this.seatsService.createSeat({
				name: `${prefix}${i + 1}`,
				x: col * spacing,
				y: row * spacing,
				size: 12,
				color: '#000000',
				icon: '',
				areaId: this.areaId!,
			});
		});

		this.creating = true;
		forkJoin(requests).subscribe({
			next: (seats) => {
				this.seatsCreated.emit(seats);
				this.finish();
			},
			error: (err: HttpErrorResponse) => this.fail(err),
		});
	}

	private generateTables(tableCount: number, prefix: string, cols: number, seatsPerTable: number, tableIcon: string) {
		const tableSpacing = 90;
		const ringRadius = 22;
		const tableRequests = Array.from({ length: tableCount }, (_, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			return this.tablesService.createTable({
				name: `${prefix} ${i + 1}`,
				icon: tableIcon,
				x: col * tableSpacing + 40,
				y: row * tableSpacing + 40,
				size: 30,
				color: '#0d6efd',
				areaId: this.areaId!,
			});
		});

		this.creating = true;
		forkJoin(tableRequests).subscribe({
			next: (tables) => {
				const seatRequests = tables.flatMap((table) =>
					Array.from({ length: seatsPerTable }, (_, s) => {
						const angle = (2 * Math.PI * s) / seatsPerTable;
						return this.seatsService.createSeat({
							name: `${table.name}-${s + 1}`,
							x: Math.round(table.x + ringRadius * Math.cos(angle)),
							y: Math.round(table.y + ringRadius * Math.sin(angle)),
							size: 10,
							color: '#000000',
							icon: '',
							areaId: this.areaId!,
							tableId: table.id,
						});
					}),
				);
				forkJoin(seatRequests).subscribe({
					next: (seats) => {
						this.tablesCreated.emit(tables);
						this.seatsCreated.emit(seats);
						this.finish();
					},
					error: (err: HttpErrorResponse) => this.fail(err),
				});
			},
			error: (err: HttpErrorResponse) => this.fail(err),
		});
	}

	private finish() {
		this.creating = false;
		this.form.reset({ count: null, prefix: '', columns: 10, seatsPerTable: null, tableIcon: 'bi-circle-fill' });
		this.errorMessage = '';
		closeModal('bulkCreateSeatsModal');
	}

	private fail(err: HttpErrorResponse) {
		this.creating = false;
		this.errorMessage = extractErrorMessage(err);
	}
}
