import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ProductSalesService, SaleProduct } from '../../services/product-sales.service';
import { Events } from '../../../../../models/events/events';
import { Product } from '../../../../../models/products/product';
import { User } from '../../../../../models/users/user';
import { EventsService } from '../../../events/services/events.service';
import { ProductsService } from '../../../products/services/products.service';
import { UserService } from '../../../users/services/user.service';
import { extractErrorMessage } from '../../../../../utils/api-error';
import { closeModal } from '../../../../../utils/modal';

@Component({
	selector: 'create-product-qr-modal',
	imports: [ReactiveFormsModule],
	template: `
		<div class="modal fade" id="createProductQrModal" tabindex="-1" aria-labelledby="createProductQrModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="createProductQrModalLabel">Vender producto / Generar QR</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form [formGroup]="form" novalidate>
							<div class="mb-3">
								<label>Event *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('eventId')" formControlName="eventId" (change)="onEventChange()">
									<option [ngValue]="null">Choose...</option>
									@for (event of events(); track event.id) {
										<option [ngValue]="event.id">{{ event.name }}</option>
									}
								</select>
								@if (isInvalid('eventId')) {
									<div class="invalid-feedback">Elegí el evento.</div>
								}
							</div>
							<div class="mb-3">
								<label>Product *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('productId')" formControlName="productId">
									<option [ngValue]="null">Choose...</option>
									@for (product of products(); track product.id) {
										<option [ngValue]="product.id">{{ product.name }} — {{ product.type }} ({{ product.price }} USD)</option>
									}
								</select>
								@if (isInvalid('productId')) {
									<div class="invalid-feedback">Elegí el producto.</div>
								}
								@if (form.controls.eventId.value && !products().length) {
									<div class="form-text">Este evento todavía no tiene productos creados.</div>
								}
							</div>
							<div class="mb-3">
								<label>Client *</label>
								<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('clientId')" formControlName="clientId">
									<option [ngValue]="null">Choose...</option>
									@for (client of clients(); track client.id) {
										<option [ngValue]="client.id">{{ client.name }} {{ client.lastname }} ({{ client.username }})</option>
									}
								</select>
								@if (isInvalid('clientId')) {
									<div class="invalid-feedback">Elegí el comprador — tiene que ser un usuario de tipo Client.</div>
								}
							</div>
							<div class="row">
								<div class="col-md-4 mb-3">
									<label>Quantity *</label>
									<input type="number" class="form-control" min="1" [class.is-invalid]="isInvalid('quantity')" formControlName="quantity" />
									@if (isInvalid('quantity')) {
										<div class="invalid-feedback">Ingresá una cantidad.</div>
									}
								</div>
								<div class="col-md-4 mb-3">
									<label>Paid type *</label>
									<select class="custom-select d-block w-100" [class.is-invalid]="isInvalid('paidType')" formControlName="paidType">
										<option value="">Choose...</option>
										<option value="Cash">Cash</option>
										<option value="Card">Card</option>
										<option value="Transfer">Transfer</option>
									</select>
									@if (isInvalid('paidType')) {
										<div class="invalid-feedback">Elegí la forma de pago.</div>
									}
								</div>
								<div class="col-md-4 mb-3">
									<label>Description</label>
									<input type="text" class="form-control" formControlName="description" />
								</div>
							</div>
							@if (errorMessage) {
								<div class="text-danger">{{ errorMessage }}</div>
							}
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger" (click)="submit()">Create</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateProductQrModalComponent implements OnInit {
	private readonly fb = inject(FormBuilder);
	private readonly productSalesService = inject(ProductSalesService);
	private readonly eventsService = inject(EventsService);
	private readonly productsService = inject(ProductsService);
	private readonly userService = inject(UserService);

	saleProductCreated = output<SaleProduct>();
	errorMessage = '';

	events = signal<Events[]>([]);
	products = signal<Product[]>([]);
	clients = signal<User[]>([]);

	form = this.fb.group({
		eventId: this.fb.control<number | null>(null, Validators.required),
		productId: this.fb.control<number | null>(null, Validators.required),
		clientId: this.fb.control<number | null>(null, Validators.required),
		quantity: this.fb.control<number>(1, [Validators.required, Validators.min(1)]),
		paidType: this.fb.control<string>('', Validators.required),
		description: this.fb.control<string>(''),
	});

	ngOnInit(): void {
		this.eventsService.getEvents().subscribe((events) => this.events.set(events));
		this.userService.getUsers().subscribe((users) => this.clients.set(users.filter((u) => u.type?.type === 'CLIENT')));
	}

	onEventChange() {
		const eventId = this.form.controls.eventId.value;
		this.products.set([]);
		this.form.patchValue({ productId: null });

		if (!eventId) return;

		this.productsService.getProductsByEvent(eventId).subscribe((products) => this.products.set(products));
	}

	isInvalid(controlName: keyof typeof this.form.controls): boolean {
		const control = this.form.controls[controlName];
		return control.invalid && control.touched;
	}

	submit() {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		const value = this.form.getRawValue();
		this.productSalesService
			.createSaleProduct({
				eventId: value.eventId!,
				productId: value.productId!,
				clientId: value.clientId!,
				paidType: value.paidType!,
				quantity: value.quantity!,
				description: value.description ?? '',
			})
			.subscribe({
				next: (saleProduct) => {
					this.saleProductCreated.emit(saleProduct);
					this.reset();
					this.errorMessage = '';
					closeModal('createProductQrModal');
				},
				error: (err: HttpErrorResponse) => {
					this.errorMessage = extractErrorMessage(err);
				},
			});
	}

	private reset() {
		this.form.reset({ eventId: null, productId: null, clientId: null, quantity: 1, paidType: '', description: '' });
		this.products.set([]);
	}
}
