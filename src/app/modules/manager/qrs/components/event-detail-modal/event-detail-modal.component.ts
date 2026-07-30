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
	codeCopied = signal(false);

	// El scanner cae a un campo de código manual cuando la cámara falla (ver qr-scanner.component.ts)
	// — sin esto, ese fallback no servía de nada porque el codeQR solo existía codificado adentro de
	// la imagen del QR, nunca como texto que alguien pudiera copiar/tipear a mano.
	copyCode(code: string) {
		navigator.clipboard.writeText(code).then(() => {
			this.codeCopied.set(true);
			setTimeout(() => this.codeCopied.set(false), 2000);
		});
	}

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
