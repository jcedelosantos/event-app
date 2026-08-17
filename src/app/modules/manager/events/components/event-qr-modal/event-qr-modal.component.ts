import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { QRCodeComponent } from 'angularx-qrcode';
import { Events } from '../../../../../models/events/events';
import { AuthService } from '../../../../../core/services/auth.service';
import { PLAN_FEATURES } from '../../../../../shared/pricing-plans';
import { isEventPlanCode } from '../../../../../shared/event-plans';

@Component({
	selector: 'app-event-qr-modal',
	imports: [QRCodeComponent],
	template: `
		<div class="modal fade" id="eventQrModal" tabindex="-1" aria-labelledby="eventQrModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="eventQrModalLabel">{{ event()?.name }}</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
					</div>
					<div class="modal-body text-center">
						@if (event(); as ev) {
							@if (publicPortalBlocked()) {
								<div class="alert alert-warning small text-start mb-3">
									<i class="bi bi-lock-fill" aria-hidden="true"></i>
									Tu plan actual no incluye portada pública — este link no va a cargar hasta que actualices a un plan Intermedio o superior.
								</div>
							}
							<qrcode [qrdata]="publicUrl(ev.code)" [width]="220" [errorCorrectionLevel]="'M'"></qrcode>
							<p class="small text-body-secondary mt-2 mb-1">Compartí este QR o link para que el público se anote solo</p>
							<a [href]="publicUrl(ev.code)" target="_blank">{{ publicUrl(ev.code) }}</a>
						}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventQrModalComponent {
	private readonly authService = inject(AuthService);

	event = input<Events | null>(null);

	// Mismo patrón que event-details.component.ts/settings.component.ts — este modal es OTRA
	// superficie con el mismo link público sujeto al mismo bloqueo por plan, así que necesita el
	// mismo aviso (ver public.ts GET /events/:code).
	publicPortalBlocked = computed(() => {
		const plan = this.authService.currentUser()?.tenant?.plan;
		if (!plan || isEventPlanCode(plan)) return false;
		return !PLAN_FEATURES[plan]?.publicPortal;
	});

	publicUrl(code: string): string {
		return `${window.location.origin}/e/${code}`;
	}
}
