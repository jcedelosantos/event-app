import { AfterViewInit, ChangeDetectionStrategy, Component, inject, Input, OnChanges, SimpleChanges, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
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
						<h1 class="modal-title fs-5" id="bulkEditTablesModalLabel">Editar mesas</h1>
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
									<label>Tamaño de sus asientos (px)</label>
									<input type="number" class="form-control" [class.is-invalid]="isInvalid('seatSize')" formControlName="seatSize" placeholder="Dejar vacío para no tocarlos" />
									@if (isInvalid('seatSize')) {
										<div class="invalid-feedback">Entre 4 y 100.</div>
									}
									<div class="form-text">Se ajusta solo con el tamaño de mesa (misma proporción que usa "Generar varios") — cambialo a mano si querés otra relación.</div>
								</div>
							</div>
							<div class="mb-3">
								<label class="d-flex align-items-center gap-2">
									<input type="checkbox" class="form-check-input" [checked]="colorEnabled()" (change)="toggleColorEnabled()" />
									Cambiar color de mesa
								</label>
								@if (colorEnabled()) {
									<input type="color" class="form-control form-control-color mt-1" formControlName="tableColor" />
								}
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
							@if (errorMessage()) {
								<div class="text-danger mt-2">{{ errorMessage() }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" [disabled]="applying() || !selected().size" (click)="submit()">
							{{ applying() ? 'Aplicando...' : 'Aplicar' }}
						</button>
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
export class BulkEditTablesModalComponent implements OnChanges, AfterViewInit {
	private readonly fb = inject(FormBuilder);
	private readonly tablesService = inject(TablesService);
	private readonly seatsService = inject(SeatsService);

	@Input() tables: Table[] = [];
	tablesUpdated = output<Table[]>();
	seatsUpdated = output<Seat[]>();

	selected = signal<Set<number>>(new Set());
	// El color arranca deshabilitado a propósito — a diferencia del tamaño (siempre se manda), el
	// color es la excepción: la mayoría de las veces que se abre este modal es solo para el tamaño,
	// y no tiene sentido pisar el color de todas las mesas seleccionadas sin que el usuario lo pida.
	colorEnabled = signal(false);
	// Signals (no campos planos): el componente es OnPush y estos se asignan desde un callback de
	// HTTP — un campo plano mutado ahí no repinta la vista sola (mismo motivo documentado en
	// create-qr-modal.component.ts), y era justo lo que dejaba el botón trabado en "Aplicando...".
	errorMessage = signal('');
	applying = signal(false);

	form = this.fb.group({
		tableSize: this.fb.control<number | null>(null, [Validators.required, Validators.min(8), Validators.max(200)]),
		seatSize: this.fb.control<number | null>(null, [Validators.min(4), Validators.max(100)]),
		tableColor: this.fb.control('#dc3545'),
	});

	toggleColorEnabled() {
		this.colorEnabled.update((v) => !v);
	}

	// Mientras el usuario no toque el campo de asientos a mano, seatSize sigue a tableSize (misma
	// proporción 3:1 que "Generar varios" usa al crear mesas nuevas — tableSize 30, seatSize 10) para
	// que los números no se queden con el mismo diámetro cuando la mesa cambia de tamaño. En cuanto
	// el usuario edita seatSize directamente, se respeta su valor y se deja de auto-ajustar.
	private seatSizeManuallySet = false;

	constructor() {
		this.form.controls.tableSize.valueChanges.subscribe((tableSize) => {
			if (this.seatSizeManuallySet || tableSize == null) return;
			this.form.controls.seatSize.setValue(this.suggestedSeatSize(tableSize), { emitEvent: false });
		});

		this.form.controls.seatSize.valueChanges.subscribe(() => {
			this.seatSizeManuallySet = true;
		});
	}

	private suggestedSeatSize(tableSize: number): number {
		return Math.max(4, Math.min(100, Math.round(tableSize / 3)));
	}

	// Sin esto, el tamaño ingresado la última vez quedaba pegado en el formulario — al reabrir el
	// modal (para las mismas mesas u otras) el campo ya venía con un valor "válido" y se reaplicaba
	// solo con tocar "Aplicar", sin que el usuario lo hubiera vuelto a escribir. Se escucha el
	// 'hidden.bs.modal' del propio modal (se cierre por Aplicar, por "Close" o por click afuera) en
	// vez de depender de que el [tables] del padre cambie de referencia, que no pasa si no hubo edición.
	ngAfterViewInit() {
		document.getElementById('bulkEditTablesModal')?.addEventListener('hidden.bs.modal', () => this.resetForm());
	}

	private resetForm() {
		this.form.reset({ tableSize: null, seatSize: null, tableColor: '#dc3545' });
		this.seatSizeManuallySet = false;
		this.colorEnabled.set(false);
		this.errorMessage.set('');
	}

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

		const { tableSize, seatSize, tableColor } = this.form.getRawValue();
		const targetTables = this.tables.filter((t) => this.selected().has(t.id));
		const tableIds = targetTables.map((t) => t.id);

		// El anillo de asientos se recalcula proporcional al cambio de tamaño de CADA mesa (no todas
		// las seleccionadas necesariamente arrancan del mismo tamaño) — conserva el ángulo real de
		// cada asiento respecto al centro de su mesa (por si alguno se arrastró a mano y no queda en
		// un anillo perfecto) y solo escala la distancia, así una mesa más chica no deja los asientos
		// "flotando" lejos como si siguiera siendo grande.
		const seatPositions = targetTables.flatMap((table) => {
			const scale = table.size > 0 ? tableSize! / table.size : 1;
			return table.seats.map((seat) => ({
				id: seat.id,
				x: table.x + (seat.x - table.x) * scale,
				y: table.y + (seat.y - table.y) * scale,
				size: seatSize ?? seat.size,
			}));
		});

		// Una request por lote (mesas, después asientos) en vez de un PUT por fila — con áreas de 50+
		// mesas eso eran cientos de requests simultáneas, que saturaban el navegador y disparaban una
		// tanda de change-detection por cada respuesta: exactamente lo que se sentía como "se congela".
		this.applying.set(true);
		this.tablesService.bulkResizeTables(tableIds, tableSize!, this.colorEnabled() ? tableColor! : undefined).subscribe({
			next: (updatedTables) => {
				this.tablesUpdated.emit(updatedTables);
				if (seatPositions.length) {
					this.seatsService.bulkUpdateSeatPositions(seatPositions).subscribe({
						next: (updatedSeats) => {
							this.seatsUpdated.emit(updatedSeats);
							this.finish();
						},
						error: (err: HttpErrorResponse) => this.fail(err),
					});
					return;
				}
				this.finish();
			},
			error: (err: HttpErrorResponse) => this.fail(err),
		});
	}

	private finish() {
		this.applying.set(false);
		// El reset de tableSize/seatSize/tableColor/colorEnabled pasa por resetForm(), disparado por
		// el 'hidden.bs.modal' que cierra closeModal() acá abajo — ver ngAfterViewInit.
		closeModal('bulkEditTablesModal');
	}

	private fail(err: HttpErrorResponse) {
		this.applying.set(false);
		this.errorMessage.set(extractErrorMessage(err));
	}
}
