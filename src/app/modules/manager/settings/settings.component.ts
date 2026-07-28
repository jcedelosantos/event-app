import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { SettingsService } from '../../../core/services/settings.service';
import { ACCENT_SETTING_KEY, DEFAULT_ACCENT, ThemeService } from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { extractErrorMessage } from '../../../utils/api-error';
import { QRCodeComponent } from 'angularx-qrcode';

const PRESETS = [
	{ name: 'Azul oscuro', hex: '#1e3a8a' },
	{ name: 'Rojo (original)', hex: '#dc3545' },
	{ name: 'Verde bosque', hex: '#14532d' },
	{ name: 'Morado', hex: '#5b21b6' },
	{ name: 'Naranja', hex: '#c2410c' },
];

@Component({
	selector: 'app-settings',
	imports: [QRCodeComponent],
	template: `
		<h2 class="section-title">Settings</h2>
		<p class="text-body-secondary small">Color de acento de toda la app: botones, badges, bordes y textos destacados.</p>

		<div class="card" style="max-width: 480px;">
			<div class="card-body">
				<div class="d-flex align-items-center gap-3 mb-3">
					<input type="color" class="form-control form-control-color" [value]="accent()" (input)="onColorInput($event)" title="Elegí el color de acento" />
					<div>
						<div class="fw-semibold">Color actual</div>
						<div class="text-body-secondary small">{{ accent() }}</div>
					</div>
				</div>

				<div class="mb-3">
					<div class="small text-body-secondary mb-1">Presets</div>
					<div class="d-flex flex-wrap gap-2">
						@for (preset of presets; track preset.hex) {
							<button
								type="button"
								class="btn btn-sm preset-btn"
								[class.active]="accent() === preset.hex"
								[style.background]="preset.hex"
								[title]="preset.name"
								(click)="onColorInput({ target: { value: preset.hex } })"
							></button>
						}
					</div>
				</div>

				<div class="d-flex gap-2 align-items-center">
					<button type="button" class="btn btn-danger btn-sm" [disabled]="saving()" (click)="save()">
						{{ saving() ? 'Guardando...' : 'Guardar' }}
					</button>
					<button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="saving()" (click)="reset()">Restaurar default</button>
					@if (saved()) {
						<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
					}
				</div>

				@if (errorMessage()) {
					<div class="text-danger small mt-2">{{ errorMessage() }}</div>
				}

				<hr />
				<div class="small text-body-secondary">Vista previa:</div>
				<div class="d-flex flex-wrap gap-2 mt-2">
					<button type="button" class="btn btn-danger btn-sm">Botón primario</button>
					<button type="button" class="btn btn-outline-danger btn-sm">Botón outline</button>
					<span class="badge text-bg-danger">Badge</span>
					<span class="text-danger small align-self-center">Texto destacado</span>
				</div>
			</div>
		</div>

		@if (orgUrl(); as url) {
			<h2 class="section-title mt-4">Portada pública</h2>
			<p class="text-body-secondary small">Página pública con todos los próximos eventos de tu organización — compartila con tus clientes.</p>

			<div class="card" style="max-width: 480px;">
				<div class="card-body">
					<div class="input-group">
						<input type="text" class="form-control" readonly [value]="url" />
						<button type="button" class="btn btn-outline-secondary" (click)="copyOrgUrl(url)">
							<i class="bi" [class.bi-clipboard]="!urlCopied()" [class.bi-clipboard-check]="urlCopied()" aria-hidden="true"></i>
							{{ urlCopied() ? 'Copiado' : 'Copiar' }}
						</button>
						<a class="btn btn-outline-secondary" [href]="url" target="_blank" rel="noopener">
							<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
						</a>
					</div>
					<div class="text-center mt-3">
						<qrcode [qrdata]="url" [width]="180" [errorCorrectionLevel]="'M'"></qrcode>
						<p class="small text-body-secondary mt-2 mb-0">Compartí este QR para que tus clientes vean todos tus próximos eventos</p>
					</div>
				</div>
			</div>
		}

			<h2 class="section-title mt-4">Pagos</h2>
			<p class="text-body-secondary small">
				Cobro online en el portal público — configurá acá PayPal y/o un link de pago manual, y después elegí "Cobro" al crear/editar cada evento.
			</p>

			<div class="card" style="max-width: 480px;">
				<div class="card-body">
					<div class="mb-3">
						<label class="small mb-1">PayPal Client ID</label>
						<input
							type="text"
							class="form-control form-control-sm"
							[value]="paypalClientId()"
							(input)="paypalClientId.set($any($event.target).value)"
							placeholder="Client ID de tu app en developer.paypal.com"
						/>
					</div>
					<div class="mb-3">
						<label class="small mb-1">PayPal Client Secret</label>
						<input
							type="password"
							class="form-control form-control-sm"
							[value]="paypalSecret()"
							(input)="paypalSecret.set($any($event.target).value)"
							[placeholder]="paypalSecretConfigured() ? '•••• configurado — dejalo vacío para no cambiarlo' : 'Pegá tu Client Secret'"
						/>
					</div>
					<div class="mb-3">
						<label class="small mb-1">Modo</label>
						<select class="form-select form-select-sm" [value]="paypalMode()" (change)="paypalMode.set($any($event.target).value)">
							<option value="sandbox">Sandbox (pruebas, sin plata real)</option>
							<option value="live">Live (cobros reales)</option>
						</select>
					</div>
					<div class="mb-3">
						<label class="small mb-1">Webhook ID <span class="text-muted">(de developer.paypal.com — confirma pagos automáticamente)</span></label>
						<input
							type="password"
							class="form-control form-control-sm"
							[value]="paypalWebhookId()"
							(input)="paypalWebhookId.set($any($event.target).value)"
							[placeholder]="paypalWebhookIdConfigured() ? '•••• configurado — dejalo vacío para no cambiarlo' : 'Opcional, pero recomendado'"
						/>
					</div>
					<hr />
					<div class="mb-3">
						<label class="small mb-1">Link de pago manual <span class="text-muted">(Opción "Link" — PayPal.me, instrucciones de transferencia, etc.)</span></label>
						<input
							type="url"
							class="form-control form-control-sm"
							[value]="linkUrl()"
							(input)="linkUrl.set($any($event.target).value)"
							placeholder="https://paypal.me/tuclub"
						/>
					</div>

					<div class="d-flex gap-2 align-items-center">
						<button type="button" class="btn btn-danger btn-sm" [disabled]="savingPayments()" (click)="savePayments()">
							{{ savingPayments() ? 'Guardando...' : 'Guardar' }}
						</button>
						@if (paymentsSaved()) {
							<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
						}
					</div>
					@if (paymentsError()) {
						<div class="text-danger small mt-2">{{ paymentsError() }}</div>
					}
				</div>
			</div>
	`,
	styleUrl: './settings.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
	private readonly settingsService = inject(SettingsService);
	private readonly themeService = inject(ThemeService);
	private readonly authService = inject(AuthService);

	presets = PRESETS;
	accent = signal(DEFAULT_ACCENT);
	saving = signal(false);
	saved = signal(false);
	errorMessage = signal('');
	urlCopied = signal(false);

	// Client Secret y Webhook ID nunca vuelven del backend (ver el filtro de GET /settings) — solo un
	// flag "Configured" que dice si ya hay uno guardado, para mostrar el placeholder "•••• configurado"
	// sin depender de releer el valor real.
	paypalClientId = signal('');
	paypalSecret = signal('');
	paypalSecretConfigured = signal(false);
	paypalMode = signal<'sandbox' | 'live'>('sandbox');
	paypalWebhookId = signal('');
	paypalWebhookIdConfigured = signal(false);
	linkUrl = signal('');
	savingPayments = signal(false);
	paymentsSaved = signal(false);
	paymentsError = signal('');

	orgUrl = computed(() => {
		const slug = this.authService.currentUser()?.tenant?.slug;
		return slug ? `${window.location.origin}/o/${slug}` : null;
	});

	ngOnInit(): void {
		this.settingsService.getSettings().subscribe((settings) => {
			this.accent.set(settings[ACCENT_SETTING_KEY] ?? DEFAULT_ACCENT);
			this.paypalClientId.set(settings['payments.paypalClientId'] ?? '');
			this.paypalSecretConfigured.set(settings['payments.paypalSecretConfigured'] === 'true');
			this.paypalMode.set(settings['payments.paypalMode'] === 'live' ? 'live' : 'sandbox');
			this.paypalWebhookIdConfigured.set(settings['payments.paypalWebhookIdConfigured'] === 'true');
			this.linkUrl.set(settings['payments.linkUrl'] ?? '');
		});
	}

	// Solo manda los campos que realmente tienen contenido — el backend rechaza valores vacíos (ver
	// PUT /settings/:key), y así tampoco hay forma de borrar una credencial ya guardada (Client
	// Secret/Webhook ID) por accidente dejando el campo en blanco y apretando Guardar. El modo
	// siempre viaja porque el <select> siempre tiene un valor real.
	savePayments() {
		this.savingPayments.set(true);
		this.paymentsError.set('');
		this.paymentsSaved.set(false);
		const clientIdToSave = this.paypalClientId().trim();
		const linkUrlToSave = this.linkUrl().trim();
		const secretToSave = this.paypalSecret().trim();
		const webhookIdToSave = this.paypalWebhookId().trim();
		const calls: Observable<unknown>[] = [this.settingsService.setSetting('payments.paypalMode', this.paypalMode())];
		if (clientIdToSave) calls.push(this.settingsService.setSetting('payments.paypalClientId', clientIdToSave));
		if (linkUrlToSave) calls.push(this.settingsService.setSetting('payments.linkUrl', linkUrlToSave));
		if (secretToSave) calls.push(this.settingsService.setSetting('payments.paypalSecret', secretToSave));
		if (webhookIdToSave) calls.push(this.settingsService.setSetting('payments.paypalWebhookId', webhookIdToSave));

		forkJoin(calls).subscribe({
			next: () => {
				this.savingPayments.set(false);
				this.paymentsSaved.set(true);
				if (secretToSave) {
					this.paypalSecret.set('');
					this.paypalSecretConfigured.set(true);
				}
				if (webhookIdToSave) {
					this.paypalWebhookId.set('');
					this.paypalWebhookIdConfigured.set(true);
				}
			},
			error: (err: HttpErrorResponse) => {
				this.savingPayments.set(false);
				this.paymentsError.set(extractErrorMessage(err));
			},
		});
	}

	onColorInput(event: Event | { target: { value: string } }) {
		const value = (event.target as HTMLInputElement).value;
		this.accent.set(value);
		this.saved.set(false);
		// Preview instantáneo mientras se elige, sin esperar a "Guardar".
		this.themeService.applyAccent(value);
	}

	save() {
		this.saving.set(true);
		this.errorMessage.set('');
		this.themeService.saveAccent(this.accent()).subscribe({
			next: () => {
				this.saving.set(false);
				this.saved.set(true);
			},
			error: (err: HttpErrorResponse) => {
				this.saving.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}

	reset() {
		this.accent.set(DEFAULT_ACCENT);
		this.themeService.applyAccent(DEFAULT_ACCENT);
		this.saved.set(false);
	}

	copyOrgUrl(url: string) {
		navigator.clipboard.writeText(url).then(() => {
			this.urlCopied.set(true);
			setTimeout(() => this.urlCopied.set(false), 2000);
		});
	}
}
