import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { QRCodeComponent } from 'angularx-qrcode';
import { Events } from '../../../../../models/events/events';

@Component({
	selector: 'app-event-qr-modal',
	imports: [QRCodeComponent],
	template: `
		<div class="modal fade" id="eventQrModal" tabindex="-1" aria-labelledby="eventQrModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="eventQrModalLabel">{{ event()?.name }}</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body text-center">
						@if (event(); as ev) {
							<qrcode [qrdata]="publicUrl(ev.code)" [width]="220" [errorCorrectionLevel]="'M'"></qrcode>
							<p class="small text-body-secondary mt-2 mb-1">Compartí este QR o link para que el público se anote solo</p>
							<a [href]="publicUrl(ev.code)" target="_blank">{{ publicUrl(ev.code) }}</a>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventQrModalComponent {
	event = input<Events | null>(null);

	publicUrl(code: string): string {
		return `${window.location.origin}/e/${code}`;
	}
}
