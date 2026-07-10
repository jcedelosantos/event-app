import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { QRService, SaleTicket } from './services/qr.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EventDetailModalComponent } from './components/event-detail-modal/event-detail-modal.component';
import { CreateQrModalComponent } from './components/create-qr-modal/create-qr-modal.component';
import { confirm } from '../../../utils/messages';
import * as bootstrap from "bootstrap";

@Component({
  selector: 'app-qrs',
  imports: [DatePipe, RouterLink, EventDetailModalComponent, CreateQrModalComponent],
  templateUrl: './qrs.component.html',
  styleUrl: './qrs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrsComponent implements OnInit, AfterViewInit {
  qrService = inject(QRService);
  qrList = signal<SaleTicket[]>([]);
  eventDetailModal: any;

  selectedDetail = signal<SaleTicket | null>(null);

  ngOnInit(): void {
    this.loadQRs();
  }

  ngAfterViewInit(): void {
    this.eventDetailModal = new bootstrap.Modal("#eventDetailModal", { backdrop: true });
  }

  loadQRs() {
    this.qrService.getQRs().subscribe((qrs) => this.qrList.set(qrs));
  }

  openDetailModal(qr: SaleTicket) {
    this.selectedDetail.set(qr);
    this.eventDetailModal?.show();
  }

  onQrCreated(qr: SaleTicket) {
    this.qrList.update((list) => [qr, ...list]);
  }

  deleteQR(qr: SaleTicket) {
    confirm(`¿Eliminar esta venta / QR?`, {
      onConfirm: () => {
        this.qrService.deleteQR(qr.id).subscribe(() => this.loadQRs());
      },
    });
  }
}
