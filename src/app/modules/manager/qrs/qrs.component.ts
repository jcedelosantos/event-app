import { AfterViewInit, ChangeDetectionStrategy, Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { QRService, SaleTicket } from './services/qr.service';
import { ProductSalesService, SaleProduct } from './services/product-sales.service';
import { Child, ChildrenService } from './services/children.service';
import { EventsService } from '../events/services/events.service';
import { AuthService } from '../../../core/services/auth.service';
import { Events } from '../../../models/events/events';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EventDetailModalComponent } from './components/event-detail-modal/event-detail-modal.component';
import { CreateQrModalComponent } from './components/create-qr-modal/create-qr-modal.component';
import { ProductSaleDetailModalComponent } from './components/product-sale-detail-modal/product-sale-detail-modal.component';
import { CreateProductQrModalComponent } from './components/create-product-qr-modal/create-product-qr-modal.component';
import { ImportSalesModalComponent } from './components/import-sales-modal/import-sales-modal.component';
import { confirm, error, promptSelect } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { eventDateKey, todayKey } from '../../../utils/dates';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from "bootstrap";

type QrSortKey = 'carnet' | 'client' | 'event' | 'seat' | 'price';
type ProductSortKey = 'carnet' | 'client' | 'date' | 'event' | 'product' | 'qty';
type QrColumnKey = QrSortKey | 'time' | 'status' | 'attendeeType' | 'payment' | 'channel';
type QrStatusFilter = 'all' | 'checked' | 'pending';

const QR_COLUMN_LABELS: Record<QrColumnKey, string> = {
  carnet: 'Carnet',
  client: 'Client',
  time: 'Hora de registro',
  event: 'Event',
  seat: 'Mesa/Asiento',
  price: 'Price',
  status: 'Estado',
  attendeeType: 'Socio/Invitado',
  payment: 'Pago',
  channel: 'Origen',
};

// dateSold viene como string ISO — comparar por el día calendario en hora LOCAL (no UTC), que es
// lo que el usuario realmente elige en el <input type="date">.
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  childrenService = inject(ChildrenService);
  private readonly eventsService = inject(EventsService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  isChurchTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CHURCH');
  childrenList = signal<Child[]>([]);

  // Borrar una venta PAID libera el asiento — solo lo puede hacer un usuario cuyo UserType.license
  // incluya '*' (admin) o el permiso explícito RELEASE_SEAT (ver hasLicense en el backend, que es
  // quien realmente hace cumplir esto; acá solo se oculta el botón para no ofrecer una acción que
  // el servidor va a rechazar con 403). Un hold todavía PENDING (checkout con pago sin confirmar)
  // no requiere ese permiso — cualquier manager puede destrabar una reserva de prueba o abandonada.
  canReleaseSeat = computed(() => {
    const license = this.authService.currentUser()?.type?.license ?? [];
    return license.includes('*') || license.includes('RELEASE_SEAT');
  });

  canDeleteQr(qr: SaleTicket): boolean {
    return qr.paymentStatus === 'PENDING' || this.canReleaseSeat();
  }

  qrList = signal<SaleTicket[]>([]);
  productSaleList = signal<SaleProduct[]>([]);
  events = signal<Events[]>([]);
  selectedEventId = signal<number | null>(null);
  searchText = signal<string>('');

  // Distinto de null solo cuando la vista "todos los eventos" viene truncada (ver
  // ALL_EVENTS_LIST_LIMIT en sale-tickets.ts/sale-products.ts) — filtrar por un evento puntual
  // siempre trae el total real, así que esto vuelve a null apenas se elige un evento.
  qrListTotalCount = signal<number | null>(null);
  productSaleListTotalCount = signal<number | null>(null);

  eventDetailModal: any;
  productSaleDetailModal: any;

  selectedDetail = signal<SaleTicket | null>(null);
  selectedProductSaleDetail = signal<SaleProduct | null>(null);

  statusFilter = signal<QrStatusFilter>('all');
  // Fecha de venta, arriba de la tabla (no una columna más) — así se puede cambiar de un click
  // en vez de tener que leerla repetida en cada fila, ya que casi siempre coincide entre ventas
  // del mismo lote/evento. Vacío = todas las fechas.
  dateFilter = signal<string>('');

  filteredQrList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    const status = this.statusFilter();
    const date = this.dateFilter();
    return this.qrList().filter((qr) => {
      const matchesSearch =
        !q ||
        `${qr.client.name} ${qr.client.lastname}`.toLowerCase().includes(q) ||
        qr.codeQR.toLowerCase().includes(q) ||
        qr.seat.name.toLowerCase().includes(q) ||
        (qr.client.carnet ?? '').toLowerCase().includes(q);
      const matchesStatus = status === 'all' || (status === 'checked' ? !!qr.checkedInAt : !qr.checkedInAt);
      const matchesDate = !date || toDateInputValue(qr.dateSold) === date;
      return matchesSearch && matchesStatus && matchesDate;
    });
  });

  filteredProductSaleList = computed(() => {
    const q = this.searchText().trim().toLowerCase();
    const date = this.dateFilter();
    return this.productSaleList().filter((sale) => {
      const matchesSearch =
        !q ||
        `${sale.client.name} ${sale.client.lastname}`.toLowerCase().includes(q) ||
        sale.codeQR.toLowerCase().includes(q) ||
        (sale.client.carnet ?? '').toLowerCase().includes(q);
      const matchesDate = !date || toDateInputValue(sale.dateSold) === date;
      return matchesSearch && matchesDate;
    });
  });

  qrColumns = (Object.keys(QR_COLUMN_LABELS) as QrColumnKey[]).map((key) => ({ key, label: QR_COLUMN_LABELS[key] }));
  // Socio/Invitado solo importa para tenants tipo CLUB — arranca visible solo para esos (el staff
  // igual la puede prender/apagar a mano con el toggle de columnas).
  isClubTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CLUB');
  visibleQrColumns = signal<Record<QrColumnKey, boolean>>({
    carnet: true,
    client: true,
    time: false,
    event: true,
    seat: true,
    price: true,
    status: true,
    attendeeType: this.authService.currentUser()?.tenant?.type === 'CLUB',
    payment: true,
    // Oculta por defecto — la mayoría de los días no importa quién cargó la venta, solo cuando hay
    // que auditar algo puntual (el staff la prende a mano con el toggle de columnas).
    channel: false,
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
    // El botón "Sale" de la tarjeta de un evento (events.component) trae acá con ?eventId=X — ese
    // evento puntual tiene prioridad sobre el default de "el que está corriendo hoy".
    const eventIdParam = Number(this.route.snapshot.queryParamMap.get('eventId'));
    this.eventsService.getEvents().subscribe((events) => {
      this.events.set(events);
      if (eventIdParam && events.some((e) => e.id === eventIdParam)) {
        this.selectedEventId.set(eventIdParam);
      } else {
        // El staff casi siempre está mirando esta pantalla para UN evento puntual (el que está
        // corriendo hoy) — filtrar por ese de entrada evita tener que buscarlo entre todos cuando
        // hay varios eventos activos en fechas parecidas.
        const today = todayKey();
        const todayEvent = events.find((e) => eventDateKey(e.dateOn) <= today && eventDateKey(e.dateOff) >= today);
        this.selectedEventId.set(todayEvent?.id ?? null);
      }
      this.loadQRs();
      this.loadProductSales();
      if (this.isChurchTenant()) {
        this.loadChildren();
      }
    });
  }

  ngAfterViewInit(): void {
    this.eventDetailModal = new bootstrap.Modal("#eventDetailModal", { backdrop: true });
    this.productSaleDetailModal = new bootstrap.Modal("#productSaleDetailModal", { backdrop: true });
  }

  onEventFilterChange() {
    this.loadQRs();
    this.loadProductSales();
    if (this.isChurchTenant()) {
      this.loadChildren();
    }
  }

  loadQRs() {
    const eventId = this.selectedEventId();
    if (eventId) {
      this.qrListTotalCount.set(null);
      this.qrService.getQRsByEvent(eventId).subscribe((qrs) => this.qrList.set(qrs));
      return;
    }
    this.qrService.getRecentQRs().subscribe(({ items, totalCount }) => {
      this.qrList.set(items);
      this.qrListTotalCount.set(totalCount != null && totalCount > items.length ? totalCount : null);
    });
  }

  loadProductSales() {
    const eventId = this.selectedEventId();
    if (eventId) {
      this.productSaleListTotalCount.set(null);
      this.productSalesService.getSaleProductsByEvent(eventId).subscribe((sales) => this.productSaleList.set(sales));
      return;
    }
    this.productSalesService.getRecentSaleProducts().subscribe(({ items, totalCount }) => {
      this.productSaleList.set(items);
      this.productSaleListTotalCount.set(totalCount != null && totalCount > items.length ? totalCount : null);
    });
  }

  loadChildren() {
    const eventId = this.selectedEventId();
    const request = eventId ? this.childrenService.getChildrenByEvent(eventId) : this.childrenService.getChildren();
    request.subscribe((children) => this.childrenList.set(children));
  }

  // Mismo criterio que toggleCheckedIn para tickets: corrección manual sin confirmación, no
  // reemplaza el retiro real por QR (POST /scan), es para cuando el staff ya lo entregó sin
  // escanear o hay que revertir un error.
  toggleChildCheckedIn(child: Child) {
    const checkedIn = !child.checkedInAt;
    this.childrenService.setCheckedIn(child.id, checkedIn).subscribe({
      next: (updated) => this.childrenList.update((list) => list.map((c) => (c.id === updated.id ? updated : c))),
      error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
    });
  }

  // Independiente de toggleChildCheckedIn — retiro del niño y entrega de comida son dos acciones
  // separadas (ver scan.ts), se puede marcar una sin la otra.
  toggleChildMealDelivered(child: Child) {
    const delivered = !child.saleProduct?.deliveredAt;
    this.childrenService.setMealDelivered(child.id, delivered).subscribe({
      next: (updated) => this.childrenList.update((list) => list.map((c) => (c.id === updated.id ? updated : c))),
      error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
    });
  }

  deleteChild(child: Child) {
    confirm(`¿Eliminar el registro de ${child.name}? Si tenía comida del día asociada, se libera el cupo.`, {
      onConfirm: () => {
        this.childrenService.deleteChild(child.id).subscribe({
          next: () => this.loadChildren(),
          error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
        });
      },
    });
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

  // Corrección manual del check-in desde el checkbox de la columna Estado — sin confirmación, para
  // no trabar a quien está parado en la puerta corrigiendo entradas una tras otra. No reemplaza el
  // check-in real por QR (POST /scan), es para cuando alguien entró sin escanear o hay que revertir.
  toggleCheckedIn(qr: SaleTicket) {
    const checkedIn = !qr.checkedInAt;
    this.qrService.setCheckedIn(qr.id, checkedIn).subscribe({
      next: (updated) => this.qrList.update((list) => list.map((q) => (q.id === updated.id ? updated : q))),
      error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
    });
  }

  // Confirmación manual de pago (Opción "Link") — pide la forma de pago real (el hold solo guardaba
  // "Link de pago" genérico) antes de confirmar, así el reporte de ventas queda igual de preciso que
  // una venta manual del manager.
  markPaid(qr: SaleTicket) {
    promptSelect(`¿Cómo pagó "${qr.client.name} ${qr.client.lastname}"?`, { Cash: 'Efectivo', Card: 'Tarjeta', Transfer: 'Transferencia', PayPal: 'PayPal' }).then((paidType) => {
      if (!paidType) return;
      this.qrService.markPaid(qr.id, paidType).subscribe({
        next: (updated) => this.qrList.update((list) => list.map((q) => (q.id === updated.id ? updated : q))),
        error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
      });
    });
  }

  // Deshace un "Marcar como pagado" apretado por error — no libera el asiento (para eso ya está
  // "Liberar asiento"), solo vuelve a Pendiente para poder confirmarlo de nuevo bien.
  markPending(qr: SaleTicket) {
    confirm(`¿Revertir el pago de "${qr.client.name} ${qr.client.lastname}"? Vuelve a quedar "Pendiente de pago" — el asiento sigue reservado.`, {
      onConfirm: () => {
        this.qrService.markPending(qr.id).subscribe({
          next: (updated) => this.qrList.update((list) => list.map((q) => (q.id === updated.id ? updated : q))),
          error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
        });
      },
    });
  }

  deleteQR(qr: SaleTicket) {
    confirm(`¿Liberar este asiento? Se elimina la venta / QR y el asiento vuelve a estar disponible.`, {
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
