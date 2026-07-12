import { ChangeDetectionStrategy, Component, effect, inject, Input, model, OnInit, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Product } from '../../../../../models/products/product';
import { Events } from '../../../../../models/events/events';
import { ProductsService } from '../../services/products.service';
import { EventsService } from '../../../events/services/events.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'app-update-product-modal',
	imports: [ReactiveFormsModule],
	template: ` <div class="modal fade" id="updateProductModal" tabindex="-1" aria-labelledby="updateProductModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="updateProductModalLabel">{{ (product()?.id ?? 0) > 0 ? 'Update' : 'Create' }} product</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" novalidate="" [formGroup]="form">
						<div class="mb-3">
							<label for="name">Name *</label>
							<input type="text" class="form-control" [class.is-invalid]="isInvalid('name')" formControlName="name" />
							@if (isInvalid('name')) {
								<div class="invalid-feedback">El nombre es obligatorio.</div>
							}
						</div>
						<div class="mb-3">
							<label for="description">Description </label>
							<input type="text" class="form-control" formControlName="description" />
						</div>
						<div class="mb-3">
							<label for="img">Photo URL *</label>
							<input type="text" class="form-control" [class.is-invalid]="isInvalid('img')" formControlName="img" placeholder="https://..." />
							@if (isInvalid('img')) {
								<div class="invalid-feedback">La foto es obligatoria.</div>
							}
						</div>
						<div class="mb-3">
							<label for="event">Event *</label>
							<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('eventId')" formControlName="eventId">
								<option [ngValue]="null">Choose...</option>
								@for (event of events(); track event.id) {
									<option [ngValue]="event.id">{{ event.name }}</option>
								}
							</select>
							@if (isInvalid('eventId')) {
								<div class="invalid-feedback">Elegí el evento al que pertenece este producto.</div>
							}
						</div>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="count">Stock *</label>
								<input type="number" class="form-control" [class.is-invalid]="isInvalid('count')" formControlName="count" />
								@if (isInvalid('count')) {
									<div class="invalid-feedback">Ingresá el stock disponible.</div>
								}
								<div class="form-text">Se descuenta automáticamente con cada venta.</div>
							</div>
							<div class="col-md-6 mb-3">
								<label for="price">Price *</label>
								<input type="number" class="form-control" [class.is-invalid]="isInvalid('price')" formControlName="price" />
								@if (isInvalid('price')) {
									<div class="invalid-feedback">Ingresá un precio.</div>
								}
							</div>
						</div>

						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="type">Type *</label>
								<input type="text" class="form-control" [class.is-invalid]="isInvalid('type')" formControlName="type" placeholder="Ej: Merchandising, Bebida, Regalo" list="productTypeList" />
								<datalist id="productTypeList">
									@for (type of typeSuggestions(); track type) {
										<option [value]="type"></option>
									}
								</datalist>
								@if (isInvalid('type')) {
									<div class="invalid-feedback">Indicá un tipo de producto.</div>
								}
							</div>
							<div class="col-md-6 mb-3">
								<label for="state">Status</label>
								<select class="custom-select d-block w-100" formControlName="active">
									@for (status of activeList(); track status.label) {
										<option [ngValue]="status.value">{{ status.label }}</option>
									}
								</select>
							</div>
							<div class="col-md-12 mb-3">
								<label for="variant">Variante <span class="text-muted">(opcional — ej. talla, color)</span></label>
								<input type="text" class="form-control" formControlName="variant" placeholder="Ej: Talla M / Rojo" />
							</div>
						</div>
						@if (errorMessage) {
							<div class="text-danger">{{ errorMessage }}</div>
						}
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal"><i class="bi bi-x-lg"></i> Close</button>
					<button type="button" class="btn btn-primary btn-sm" (click)="save()">
						<i class="bi bi-floppy-fill" aria-hidden="true"></i> {{ (product()?.id ?? 0) > 0 ? 'Update' : 'Create' }}
					</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateProductModalComponent implements OnInit {
	private readonly productsService = inject(ProductsService);
	private readonly eventsService = inject(EventsService);

	product = model<Product | null>(null);
	@Input() defaultEventId: number | null = null;
	productSaved = output<void>();
	errorMessage = '';

	events = signal<Events[]>([]);

	typeSuggestions = signal<string[]>(['Merchandising', 'Bebida', 'Regalo', 'Souvenir']);
	activeList = signal<{ label: string; value: boolean }[]>([
		{ label: 'Active', value: true },
		{ label: 'Inactive', value: false },
	]);

	form = new FormGroup({
		name: new FormControl<string | null>(null, Validators.required),
		description: new FormControl<string | null>(null),
		img: new FormControl<string | null>(null, Validators.required),
		eventId: new FormControl<number | null>(null, Validators.required),
		type: new FormControl<string | null>(null, Validators.required),
		variant: new FormControl<string | null>(null),
		count: new FormControl<number | null>(null, Validators.required),
		active: new FormControl<boolean>(true, [Validators.required]),
		price: new FormControl<number | null>(null, Validators.required),
	});

	constructor() {
		effect(() => {
			this.errorMessage = '';
			const current = this.product();
			if (current) {
				this.form.patchValue({ ...current });
			} else {
				this.form.reset({ active: true, eventId: this.defaultEventId });
			}
		});
	}

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
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
			name: value.name!,
			description: value.description ?? '',
			img: value.img ?? '',
			eventId: value.eventId!,
			type: value.type!,
			variant: value.variant ?? '',
			count: value.count!,
			active: value.active!,
			price: value.price!,
		};

		const current = this.product();
		const request = current ? this.productsService.updateProduct(current.id, payload) : this.productsService.createProduct(payload);

		request.subscribe({
			next: () => {
				this.productSaved.emit();
				this.product.set(null);
				this.errorMessage = '';
				closeModal('updateProductModal');
			},
			error: (err: HttpErrorResponse) => {
				this.errorMessage = extractErrorMessage(err);
			},
		});
	}
}
