import { AfterViewInit, ChangeDetectionStrategy, Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
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
import { ImportSalesModalComponent } from './components/import-sales-modal/import-sales-modal.component';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from "bootstrap";

type QrSortKey = 'carnet' | 'client' | 'date' | 'event' | 'seat' | 'price';
type ProductSortKey = 'carnet' | 'client' | 'date' | 'event' | 'product' | 'qty';
type QrColumnKey = QrSortKey | 'time' | 'status';
type QrStatusFilter = 'all' | 'checked' | 'pending';

const QR_COLUMN_LABELS: Record<QrColumnKey, string> = {
  carnet: 'Carnet',
  client: 'Client',
  date: 'Date',
  time: 'Hora de registro',
  event: 'Event',
  seat: 'Mesa/Asiento',
  price: 'Price',
  status: 'Estado',
};

@Component({
  selector: 'app-qrs',
  imports: [DatePipe, FormsModule, RouterLink, EventDetailModalComponent, CreateQrModalComponent, ProductSaleDetailModalComponent, CreateProductQrModalComponent, ImportSalesModalComponent],
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

  statusFilter = signal<QrStatusFilter>('all');

  filteredQrList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    return this.qrList().filter((qr) => {
      const matchesSearch =
        !q ||
        `${qr.client.name} ${qr.client.lastname}`.toLowerCase().includes(q) ||
        qr.codeQR.toLowerCase().includes(q) ||
        qr.seat.name.toLowerCase().includes(q) ||
        (qr.client.carnet ?? '').toLowerCase().includes(q);
      const matchesStatus = status === 'all' || (status === 'checked' ? !!qr.checkedInAt : !qr.checkedInAt);
      return matchesSearch && matchesStatus;
    });
  });

  filteredProductSaleList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    if (!q) return this.productSaleList();
    return this.productSaleList().filter(
      (sale) =>
        `${sale.client.name} ${sale.client.lastname}`.toLowerCase().includes(q) ||
        sale.codeQR.toLowerCase().includes(q) ||
        (sale.client.carnet ?? '').toLowerCase().includes(q),
    );
  });

  qrColumns = (Object.keys(QR_COLUMN_LABELS) as QrColumnKey[]).map((key) => ({ key, label: QR_COLUMN_LABELS[key] }));
  visibleQrColumns = signal<Record<QrColumnKey, boolean>>({
    carnet: true,
    client: true,
    date: true,
    time: false,
    event: true,
    seat: true,
    price: true,
    status: true,
  });

  toggleQrColumn(key: QrColumnKey) {
    this.visibleQrColumns.update((cols) => ({ ...cols, [key]: !cols[key] }));
  }

  // El data-API de Bootstrap para dropdowns (data-bs-toggle="dropdown") no estaba abriendo el
  // menú de forma confiable — se maneja directo con un signal en vez de pelear con el ciclo de
  // vida del componente Dropdown de Bootstrap. El (click) con stopPropagation en el contenedor
  // evita que clicks adentro del dropdown (el botón, los checkboxes) lleguen a este listener y lo
  // cierren antes de que el usuario pueda tildar algo.
  columnsMenuOpen = signal(false);

  @HostListener('document:click')
  closeColumnsMenu() {
    this.columnsMenuOpen.set(false);
  }

  qrSortKey = signal<QrSortKey | null>(null);
  qrSortDir = signal<'asc' | 'desc'>('asc');

  sortedQrList = computed(() => {
    const key = this.qrSortKey();
    const list = [...this.filteredQrList()];
    if (!key) return list;
    const dir = this.qrSortDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) => this.compareValues(this.qrSortValue(a, key), this.qrSortValue(b, key)) * dir);
  });

  private qrSortValue(qr: SaleTicket, key: QrSortKey): string | number {
    switch (key) {
      case 'carnet': return qr.client.carnet ?? '';
      case 'client': return `${qr.client.name} ${qr.client.lastname}`;
      case 'date': return qr.dateSold;
      case 'event': return qr.event.name;
      case 'seat': return `${qr.seat.area.name} / ${qr.seat.name}`;
      case 'price': return qr.ticket.price;
    }
  }

  toggleQrSort(key: QrSortKey) {
    if (this.qrSortKey() === key) {
      this.qrSortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.qrSortKey.set(key);
      this.qrSortDir.set('asc');
    }
  }

  qrSortIcon(key: QrSortKey): string {
    if (this.qrSortKey() !== key) return 'bi-arrow-down-up text-muted small';
    return this.qrSortDir() === 'asc' ? 'bi-sort-alpha-down' : 'bi-sort-alpha-up';
  }

  productSortKey = signal<ProductSortKey | null>(null);
  productSortDir = signal<'asc' | 'desc'>('asc');

  sortedProductSaleList = computed(() => {
    const key = this.productSortKey();
    const list = [...this.filteredProductSaleList()];
    if (!key) return list;
    const dir = this.productSortDir() === 'asc' ? 1 : -1;
    return list.sort((a, b) => this.compareValues(this.productSortValue(a, key), this.productSortValue(b, key)) * dir);
  });

  private productSortValue(sale: SaleProduct, key: ProductSortKey): string | number {
    switch (key) {
      case 'carnet': return sale.client.carnet ?? '';
      case 'client': return `${sale.client.name} ${sale.client.lastname}`;
      case 'date': return sale.dateSold;
      case 'event': return sale.event.name;
      case 'product': return sale.product.name;
      case 'qty': return sale.quantity;
    }
  }

  toggleProductSort(key: ProductSortKey) {
    if (this.productSortKey() === key) {
      this.productSortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.productSortKey.set(key);
      this.productSortDir.set('asc');
    }
  }

  productSortIcon(key: ProductSortKey): string {
    if (this.productSortKey() !== key) return 'bi-arrow-down-up text-muted small';
    return this.productSortDir() === 'asc' ? 'bi-sort-alpha-down' : 'bi-sort-alpha-up';
  }

  private compareValues(av: string | number, bv: string | number): number {
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  }

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

  // La importación masiva crea ventas para el evento que se haya elegido DENTRO del modal, que no
  // necesariamente es el mismo que el filtro de esta pantalla — recargar contra el filtro actual
  // (no simplemente insertar en la lista) evita mostrar ventas de otro evento mezcladas.
  onSalesImported() {
    this.loadQRs();
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
