import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NgClass } from '@angular/common';
import { Product } from '../../../../../models/products/product';

@Component({
	selector: 'product-card',
	imports: [NgClass],
	template: `
		@if (product()) {
			<div class="card text-white bg-dark mb-3 h-100 d-flex flex-column">
				@if (product().img) {
					<img [src]="product().img" class="product-photo" alt="" />
				}
				<div class="card-header">
					<div class="row">
						<div class="col-9">
							<span class="badge" [ngClass]="{ 'text-bg-success': product().active, 'text-bg-danger': !product().active }">
								{{ product().active ? 'Active' : 'Inactive' }}
							</span>
							<span class="badge text-bg-secondary m-1">{{ product().type }}</span>
							@if (product().variant) {
								<span class="badge text-bg-info m-1">{{ product().variant }}</span>
							}
						</div>
						<div class="col-3">
							<div class="d-flex flex-row-reverse">
								<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteProduct.emit(product())"><i class="bi bi-x-lg"></i></button>
								<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" (click)="selectedProduct.emit(product())" data-bs-toggle="modal" data-bs-target="#updateProductModal"><i class="bi bi-pencil"></i></button>
							</div>
						</div>
					</div>
				</div>
				<div class="card-body d-flex flex-column flex-grow-1">
					<h5 class="card-title">{{ product().name }}</h5>
					<p class="card-text ps-3 product-description">{{ product().description }}</p>
					<hr class="mt-auto" />
					<div class="d-flex justify-content-around">
						<h5 class="text-body-secondary"><i class="bi bi-box-seam"></i> {{ product().count }}</h5>
						<h5 class="text-body-secondary"><i class="bi bi-currency-dollar"></i>{{ product().price }}</h5>
					</div>
					<div class="text-center small text-body-secondary">{{ product().code }}</div>
				</div>
			</div>
		}
	`,
	styleUrl: './product-card.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
	product = input.required<Product>();
	selectedProduct = output<Product | null>();
	deleteProduct = output<Product>();
}
