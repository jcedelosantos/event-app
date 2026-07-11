import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { QRCodeComponent } from 'angularx-qrcode';
import { HttpErrorResponse } from '@angular/common/http';
import { QRService, SaleTicket } from '../../services/qr.service';
import { extractErrorMessage } from '../../../../../utils/api-error';

@Component({
	selector: 'app-event-detail-modal',
	imports: [DatePipe, QRCodeComponent],
	templateUrl: './event-detail-modal.component.html',
	styleUrl: './event-detail-modal.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailModalComponent {
	private readonly qrService = inject(QRService);

	eventDetail = input<SaleTicket | null>(null);

	resending = signal(false);
	resendMessage = signal('');
	resendOk = signal(false);

	resend() {
		const detail = this.eventDetail();
		if (!detail) return;

		this.resending.set(true);
		this.resendMessage.set('');
		this.qrService.resendQR(detail.id).subscribe({
			next: () => {
				this.resending.set(false);
				this.resendOk.set(true);
				this.resendMessage.set(`Correo reenviado a ${detail.client.email}.`);
			},
			error: (err: HttpErrorResponse) => {
				this.resending.set(false);
				this.resendOk.set(false);
				this.resendMessage.set(extractErrorMessage(err));
			},
		});
	}
}
