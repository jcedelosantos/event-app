import { AfterViewInit, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { QR, QRService } from './services/qr.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EventDetailModalComponent } from './components/event-detail-modal/event-detail-modal.component';
import * as bootstrap from "bootstrap";

@Component({
  selector: 'app-qrs',
  imports: [DatePipe, RouterLink, EventDetailModalComponent],
  templateUrl: './qrs.component.html',
  styleUrl: './qrs.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrsComponent implements AfterViewInit {
  qrService = inject(QRService);
  qrList = signal<QR[]>(this.qrService.getQRs());
  eventDetailModal: any;

  selectedDetail = signal<QR | null>(null);

  ngAfterViewInit(): void {
    this.eventDetailModal = new bootstrap.Modal("#eventDetailModal", { backdrop: true });
  }

  openDetailModal(qr: QR) {
    this.selectedDetail.set(qr);
    this.eventDetailModal?.show();
  }
}
