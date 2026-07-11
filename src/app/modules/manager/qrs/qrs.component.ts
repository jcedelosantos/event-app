import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { QRService, SaleTicket } from './services/qr.service';
import { ProductSalesService, SaleProduct } from './services/product-sales.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EventDetailModalComponent } from './components/event-detail-modal/event-detail-modal.component';
import { CreateQrModalComponent } from './components/create-qr-modal/create-qr-modal.component';
import { ProductSaleDetailModalComponent } from './components/product-sale-detail-modal/product-sale-detail-modal.component';
import { CreateProductQrModalComponent } from './components/create-product-qr-modal/create-product-qr-modal.component';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from "bootstrap";

@Component({
  selector: 'app-qrs',
  imports: [DatePipe, RouterLink, EventDetailModalComponent, CreateQrModalComponent, ProductSaleDetailModalComponent, CreateProductQrModalComponent],
  templateUrl: './qrs.component.html',
  styleUrl: './qrs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrsComponent implements OnInit, AfterViewInit {
  qrService = inject(QRService);
  productSalesService = inject(ProductSalesService);
  qrList = signal<SaleTicket[]>([]);
  productSaleList = signal<SaleProduct[]>([]);
  eventDetailModal: any;
  productSaleDetailModal: any;

  selectedDetail = signal<SaleTicket | null>(null);
  selectedProductSaleDetail = signal<SaleProduct | null>(null);

  ngOnInit(): void {
    this.loadQRs();
    this.loadProductSales();
  }

  ngAfterViewInit(): void {
    this.eventDetailModal = new bootstrap.Modal("#eventDetailModal", { backdrop: true });
    this.productSaleDetailModal = new bootstrap.Modal("#productSaleDetailModal", { backdrop: true });
  }

  loadQRs() {
    this.qrService.getQRs().subscribe((qrs) => this.qrList.set(qrs));
  }

  loadProductSales() {
    this.productSalesService.getSaleProducts().subscribe((sales) => this.productSaleList.set(sales));
  }

  openDetailModal(qr: SaleTicket) {
    this.selectedDetail.set(qr);
    this.eventDetailModal?.show();
  }

  openProductSaleDetailModal(sale: SaleProduct) {
    this.selectedProductSaleDetail.set(sale);
    this.productSaleDetailModal?.show();
  }

  onQrCreated(qr: SaleTicket) {
    this.qrList.update((list) => [qr, ...list]);
  }

  onProductSaleCreated(sale: SaleProduct) {
    this.productSaleList.update((list) => [sale, ...list]);
  }

  deleteQR(qr: SaleTicket) {
    confirm(`¿Eliminar esta venta / QR?`, {
      onConfirm: () => {
        this.qrService.deleteQR(qr.id).subscribe({
          next: () => this.loadQRs(),
          error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
        });
      },
    });
  }

  deleteProductSale(sale: SaleProduct) {
    confirm(`¿Eliminar esta venta de producto?`, {
      onConfirm: () => {
        this.productSalesService.deleteSaleProduct(sale.id).subscribe({
          next: () => this.loadProductSales(),
          error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
        });
      },
    });
  }
}
