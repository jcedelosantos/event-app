import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';

import { Product } from '../../../models/products/product';

import { ProductCardComponent } from './components/product-card/product-card.component';
import { UpdateProductModalComponent } from './components/update-product-modal/update-product-modal.component';
import { ImportProductsModalComponent } from './components/import-products-modal/import-products-modal.component';
import { ProductsService } from './services/products.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
	selector: 'app-products',
	imports: [ProductCardComponent, UpdateProductModalComponent, ImportProductsModalComponent],
	template: `
		<h2 class="section-title">Products Manager</h2>

		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search">
					<button type="button" class="btn btn-danger me-4" (click)="selectedProduct.set(null)" data-bs-toggle="modal" data-bs-target="#updateProductModal">Create</button>
					<button type="button" class="btn btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#importProductsModal">
						<i class="bi bi-upload" aria-hidden="true"></i> Importar desde CSV
					</button>
				</form>
			</div>
		</nav>
		<br />
		@if (products()) {
			<div class="row">
				@for (product of products(); track product.id) {
					<div class="col-xxl-3 col-xl-4 col-lg-12 col-md-12 col-sm-12 col-12 ">
						<product-card [product]="product" (selectedProduct)="selectedProduct.set($event)" (deleteProduct)="onDeleteProduct($event)" />
					</div>
				} @empty {
					<p class="text-body-secondary">Todavía no hay productos cargados. Creá el primero con el botón "Create".</p>
				}
			</div>
		}
		<app-update-product-modal [product]="selectedProduct()" (productSaved)="loadProducts()" />
		<import-products-modal (imported)="loadProducts()" />
	`,
	styleUrl: './products.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsComponent implements OnInit {
	private readonly productsSrv = inject(ProductsService);

	products = signal<Product[]>([]);
	selectedProduct = signal<Product | null>(null);

	ngOnInit(): void {
		this.loadProducts();
	}

	loadProducts() {
		this.productsSrv.getProducts().subscribe((products) => this.products.set(products));
	}

	onDeleteProduct(product: Product) {
		confirm(`¿Eliminar el producto "${product.name}"?`, {
			onConfirm: () => {
				this.productsSrv.deleteProduct(product.id).subscribe({
					next: () => this.loadProducts(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				});
			},
		});
	}
}
