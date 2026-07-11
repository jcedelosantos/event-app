import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { QRService, SaleTicket } from './services/qr.service';
import { ProductSalesService, SaleProduct } from './services/product-sales.service';
import { EventsService } from '../events/services/events.service';
import { Events } from '../../../models/events/events';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EventDetailModalComponent } from './components/event-detail-modal/event-detail-modal.component';
import { CreateQrModalComponent } from './components/create-qr-modal/create-qr-modal.component';
import { ProductSaleDetailModalComponent } from './components/product-sale-detail-modal/product-sale-detail-modal.component';
import { CreateProductQrModalComponent } from './components/create-product-qr-modal/create-product-qr-modal.component';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from "bootstrap";

@Component({
  selector: 'app-qrs',
  imports: [DatePipe, FormsModule, RouterLink, EventDetailModalComponent, CreateQrModalComponent, ProductSaleDetailModalComponent, CreateProductQrModalComponent],
  templateUrl: './qrs.component.html',
  styleUrl: './qrs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrsComponent implements OnInit, AfterViewInit {
  qrService = inject(QRService);
  productSalesService = inject(ProductSalesService);
  private readonly eventsService = inject(EventsService);

  qrList = signal<SaleTicket[]>([]);
  productSaleList = signal<SaleProduct[]>([]);
  events = signal<Events[]>([]);
  selectedEventId = signal<number | null>(null);
  searchText = signal<string>('');

  eventDetailModal: any;
  productSaleDetailModal: any;

  selectedDetail = signal<SaleTicket | null>(null);
  selectedProductSaleDetail = signal<SaleProduct | null>(null);

  filteredQrList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    if (!q) return this.qrList();
    return this.qrList().filter(
      (qr) =>
        `${qr.client.name} ${qr.client.lastname}`.toLowerCase().includes(q) ||
        qr.codeQR.toLowerCase().includes(q) ||
        qr.seat.name.toLowerCase().includes(q),
    );
  });

  filteredProductSaleList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    if (!q) return this.productSaleList();
    return this.productSaleList().filter(
      (sale) => `${sale.client.name} ${sale.client.lastname}`.toLowerCase().includes(q) || sale.codeQR.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.eventsService.getEvents().subscribe((events) => {
      this.events.set(events);
      // El staff casi siempre está mirando esta pantalla para UN evento puntual (el que está
      // corriendo hoy) — filtrar por ese de entrada evita tener que buscarlo entre todos cuando
      // hay varios eventos activos en fechas parecidas.
      const today = todayKey();
      const todayEvent = events.find((e) => eventDateKey(e.dateOn) <= today && eventDateKey(e.dateOff) >= today);
      this.selectedEventId.set(todayEvent?.id ?? null);
      this.loadQRs();
      this.loadProductSales();
    });
  }

  ngAfterViewInit(): void {
    this.eventDetailModal = new bootstrap.Modal("#eventDetailModal", { backdrop: true });
    this.productSaleDetailModal = new bootstrap.Modal("#productSaleDetailModal", { backdrop: true });
  }

  onEventFilterChange() {
    this.loadQRs();
    this.loadProductSales();
  }

  loadQRs() {
    const eventId = this.selectedEventId();
    const request = eventId ? this.qrService.getQRsByEvent(eventId) : this.qrService.getQRs();
    request.subscribe((qrs) => this.qrList.set(qrs));
  }

  loadProductSales() {
    const eventId = this.selectedEventId();
    const request = eventId ? this.productSalesService.getSaleProductsByEvent(eventId) : this.productSalesService.getSaleProducts();
    request.subscribe((sales) => this.productSaleList.set(sales));
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
