import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { EventTransaction, EventTransactionType } from '../../../../../models/event-transactions/event-transaction';
import { EventTransactionsService } from '../../services/event-transactions.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';
import { centsToDollars, dollarsToCents } from '../../../../../shared/money';

const EXPENSE_CATEGORY_SUGGESTIONS = ['Renta de espacio', 'Animador', 'Staff/colaboradores', 'Decoración', 'Sonido/iluminación', 'Transporte'];
const INCOME_CATEGORY_SUGGESTIONS = ['Patrocinio', 'Otro ingreso'];

@Component({
	selector: 'app-create-transaction-modal',
	imports: [ReactiveFormsModule, FormsModule],
	template: `
		<div class="modal fade" id="createTransactionModal" tabindex="-1" aria-labelledby="createTransactionModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createTransactionModalLabel">{{ (transaction()?.id ?? 0) > 0 ? 'Editar' : 'Agregar' }} movimiento</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
					</div>
					<div class="modal-body">
						<form class="needs-validation" novalidate="" [formGroup]="form">
							<div class="mb-3">
								<label for="type">Tipo *</label>
								<select class="custom-select d-block w-100" formControlName="type">
									<option value="EXPENSE">Gasto</option>
									<option value="INCOME">Ingreso</option>
								</select>
							</div>
							<div class="mb-3">
								<label for="category">Categoría *</label>
								<select class="custom-select d-block w-100 mb-2" [class.is-invalid]="isInvalid('category')" [ngModel]="selectedCategoryPreset()" [ngModelOptions]="{ standalone: true }" (ngModelChange)="onCategoryPresetChange($event)">
									<option value="">Elegir...</option>
									@for (category of categorySuggestions(); track category) {
										<option [value]="category">{{ category }}</option>
									}
									<option value="__custom__">Otra categoría...</option>
								</select>
								@if (usingCustomCategory()) {
									<input type="text" class="form-control" [class.is-invalid]="isInvalid('category')" formControlName="category" placeholder="Ej: Permisos municipales" />
								}
								@if (isInvalid('category')) {
									<div class="invalid-feedback d-block">Indica una categoría.</div>
								}
							</div>
							<div class="mb-3">
								<label for="description">Descripción <span class="text-muted">(opcional)</span></label>
								<input type="text" class="form-control" formControlName="description" />
							</div>
							<div class="mb-3">
								<label for="amount">Monto (USD) *</label>
								<input type="number" step="0.01" min="0" class="form-control" [class.is-invalid]="isInvalid('amount')" formControlName="amount" />
								@if (isInvalid('amount')) {
									<div class="invalid-feedback">Ingresa un monto.</div>
								}
							</div>
							@if (errorMessage()) {
								<div class="text-danger">{{ errorMessage() }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Cerrar</button>
						<button type="button" class="btn btn-primary btn-sm" (click)="save()">
							<i class="bi bi-floppy-fill" aria-hidden="true"></i> {{ (transaction()?.id ?? 0) > 0 ? 'Guardar' : 'Agregar' }}
						</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTransactionModalComponent {
	private readonly eventTransactionsService = inject(EventTransactionsService);

	eventId = input.required<number>();
	transaction = model<EventTransaction | null>(null);
	transactionSaved = output<void>();
	// Signal (no campo plano): el componente es OnPush y esto se asigna desde un callback de HTTP —
	// mismo motivo documentado en create-qr-modal.component.ts.
	errorMessage = signal('');

	form = new FormGroup({
		type: new FormControl<EventTransactionType>('EXPENSE', { nonNullable: true }),
		category: new FormControl<string | null>(null, Validators.required),
		description: new FormControl<string | null>(null),
		amount: new FormControl<number | null>(null, Validators.required),
	});

	// form.controls.type.value no es un signal — sin este puente, categorySuggestions() nunca se
	// recalcularía al cambiar el <select> (mismo motivo documentado en create-qr-modal.component.ts
	// sobre por qué acá hace falta un signal en vez de leer el FormControl directo).
	private readonly typeSignal = signal<EventTransactionType>('EXPENSE');
	categorySuggestions = computed(() => (this.typeSignal() === 'INCOME' ? INCOME_CATEGORY_SUGGESTIONS : EXPENSE_CATEGORY_SUGGESTIONS));

	// Espejo del select de categoría — igual que en update-gate-modal.component.ts, separado del
	// FormControl category porque el select necesita distinguir "vacío sin elegir" de "__custom__"
	// (mostrar el input de texto libre para categorías que no están en la lista sugerida).
	selectedCategoryPreset = signal('');
	usingCustomCategory = computed(() => this.selectedCategoryPreset() === '__custom__');

	constructor() {
		// Cambiar el tipo (Gasto/Ingreso) cambia la lista de sugerencias — la categoría elegida antes
		// puede ya no aplicar, así que se limpia junto con el tipo. El patch de abajo (modo edición)
		// pisa este reset con el valor real después, mismo truco de orden que en
		// update-user-modal.component.ts.
		this.form.controls.type.valueChanges.subscribe((type) => {
			this.typeSignal.set(type);
			this.selectedCategoryPreset.set('');
			this.form.controls.category.setValue(null);
		});

		effect(() => {
			this.errorMessage.set('');
			const current = this.transaction();
			if (current) {
				this.form.patchValue({
					type: current.type,
					category: current.category,
					description: current.description,
					amount: centsToDollars(current.amountCents),
				});
				const suggestions = this.categorySuggestions();
				this.selectedCategoryPreset.set(current.category && suggestions.includes(current.category) ? current.category : '__custom__');
			} else {
				this.form.reset({ type: 'EXPENSE', category: null, description: null, amount: null });
			}
		});
	}

	onCategoryPresetChange(value: string) {
		this.selectedCategoryPreset.set(value);
		this.form.controls.category.setValue(value && value !== '__custom__' ? value : null);
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	save() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		const payload = {
			type: value.type,
			category: value.category!,
			description: value.description ?? '',
			amountCents: dollarsToCents(value.amount!),
			eventId: this.eventId(),
		};

		const current = this.transaction();
		const request = current ? this.eventTransactionsService.update(current.id, payload) : this.eventTransactionsService.create(payload);

		request.subscribe({
			next: () => {
				this.transactionSaved.emit();
				this.transaction.set(null);
				this.errorMessage.set('');
				closeModal('createTransactionModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}
}
