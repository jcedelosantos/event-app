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
									<div class="d-flex gap-2">
										<button
											type="button"
											class="icon-choice"
											[class.active]="form.controls.tableIcon.value === 'bi-circle-fill'"
											(click)="form.patchValue({ tableIcon: 'bi-circle-fill' })"
										>
											<i class="bi bi-circle-fill"></i>
											<span class="icon-choice-label">Mesa redonda</span>
										</button>
										<button
											type="button"
											class="icon-choice"
											[class.active]="form.controls.tableIcon.value === 'bi-square-fill'"
											(click)="form.patchValue({ tableIcon: 'bi-square-fill' })"
										>
											<i class="bi bi-square-fill"></i>
											<span class="icon-choice-label">Mesa rectangular</span>
										</button>
									</div>
								</div>
							</div>
							@if (form.controls.seatsPerTable.value) {
								<div class="form-text">
									Se crean {{ form.controls.count.value || 0 }} mesas ("{{ nextTablePreview() }}", "{{ nextTablePreview(1) }}"...) con
									{{ form.controls.seatsPerTable.value }} asientos cada una, acomodados en anillo alrededor del ícono de la mesa — cada asiento se vende por separado. Después
									podés arrastrar cada mesa (y cada asiento) para ajustar la posición exacta.
								</div>
							} @else {
								<div class="form-text">
									Se crean como "{{ nextSeatPreview() }}", "{{ nextSeatPreview(1) }}", etc., acomodados en una cuadrícula — después podés arrastrar cada uno para ajustar su
									posición exacta.
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
	styles: [
		`
			.icon-choice {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 4px;
				width: 110px;
				padding: 10px 6px;
				border-radius: 8px;
				border: 1px solid #444;
				background: #1c1f24;
				color: #ccc;
				font-size: 11px;
				cursor: pointer;
			}
			.icon-choice i {
				font-size: 20px;
			}
			.icon-choice-label {
				text-align: center;
				line-height: 1.1;
			}
			.icon-choice.active {
				border-color: var(--app-accent);
				background: rgba(var(--app-accent-rgb), 0.15);
				color: #fff;
			}
			.icon-choice.active i {
				color: var(--app-accent);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkCreateSeatsModalComponent {
	private readonly fb = inject(FormBuilder);
	private readonly seatsService = inject(SeatsService);
	private readonly tablesService = inject(TablesService);

	@Input() areaId: number | undefined;
	// Nombres ya existentes en el área — se usan para que el numerador continúe donde quedó en vez
	// de siempre arrancar en 1 (bug real: generar "2 mesas más" pisaba los nombres "Mesa 1"/"Mesa 2"
	// que ya existían).
	@Input() existingTableNames: string[] = [];
	@Input() existingFlatSeatNames: string[] = [];
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

	// Busca, entre los nombres existentes, el mayor número que sigue al prefijo dado (p.ej. "Mesa 7"
	// con prefijo "Mesa" → 7) y devuelve el siguiente. Sin coincidencias, arranca en 1 — igual que
	// antes para un área vacía.
	private nextNumber(names: string[], prefix: string, separator: string): number {
		const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`^${escaped}${separator}(\\d+)$`, 'i');
		let max = 0;
		for (const name of names) {
			const match = name.trim().match(re);
			if (match) max = Math.max(max, Number(match[1]));
		}
		return max + 1;
	}

	nextTablePreview(offset = 0): string {
		const prefix = this.form.controls.prefix.value || 'Mesa';
		const start = this.nextNumber(this.existingTableNames, prefix, ' ');
		return `${prefix} ${start + offset}`;
	}

	nextSeatPreview(offset = 0): string {
		const prefix = this.form.controls.prefix.value || 'A';
		const start = this.nextNumber(this.existingFlatSeatNames, prefix, '');
		return `${prefix}${start + offset}`;
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
		const margin = 40;
		const startNumber = this.nextNumber(this.existingFlatSeatNames, prefix, '');
		const requests = Array.from({ length: count }, (_, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			return this.seatsService.createSeat({
				name: `${prefix}${startNumber + i}`,
				x: col * spacing + margin,
				y: row * spacing + margin,
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
		// Los asientos del picker público son círculos fijos de 22px — con 10 por mesa, el radio del
		// anillo tiene que ser lo bastante grande para que no se toquen entre sí (mínimo ~42px para
		// 10 puntos), y la separación entre mesas mayor al diámetro del anillo para que no se pisen
		// mesas vecinas.
		const tableSpacing = 140;
		const ringRadius = 45;
		// El margen inicial tiene que ser mayor al radio del anillo — si no, la primera fila/columna
		// de mesas nace con sillas recortadas contra el borde superior/izquierdo del lienzo (se veían
		// pegadas arriba, casi saliéndose del plano).
		const margin = ringRadius + 55;
		const startNumber = this.nextNumber(this.existingTableNames, prefix, ' ');
		const tableRequests = Array.from({ length: tableCount }, (_, i) => {
			const col = i % cols;
			const row = Math.floor(i / cols);
			return this.tablesService.createTable({
				name: `${prefix} ${startNumber + i}`,
				icon: tableIcon,
				x: col * tableSpacing + margin,
				y: row * tableSpacing + margin,
				size: 30,
				color: '#dc3545',
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
