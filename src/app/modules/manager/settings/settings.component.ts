import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { SettingsService } from '../../../core/services/settings.service';
import { ACCENT_SETTING_KEY, DEFAULT_ACCENT, ThemeService } from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { UploadsService } from '../../../core/services/uploads.service';
import { extractErrorMessage } from '../../../utils/api-error';
import { confirm } from '../../../utils/messages';
import { QRCodeComponent } from 'angularx-qrcode';
import { environment } from '../../../../environments/environment';
import { PLAN_FEATURES } from '../../../shared/pricing-plans';
import { isEventPlanCode } from '../../../shared/event-plans';

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
		<h2 class="section-title">Configuración</h2>
		@if (loadError()) {
			<div class="alert alert-danger">No se pudo cargar la configuración: {{ loadError() }}</div>
		}

		<div class="row g-3">
			<div class="col-lg-6">
				<h6>Color de acento</h6>
				<p class="text-body-secondary small">Color de toda la app: botones, badges, bordes y textos destacados.</p>
				<div class="card">
					<div class="card-body">
						<div class="d-flex align-items-center gap-3 mb-3">
							<input type="color" class="form-control form-control-color" [value]="accent()" (input)="onColorInput($event)" title="Elige el color de acento" />
							<div>
								<div class="fw-semibold">Color actual</div>
								<div class="text-body-secondary small">{{ accent() }}</div>
							</div>
						</div>

						<div class="mb-3">
							<div class="small text-body-secondary mb-1">Predefinidos</div>
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
							<span class="badge text-bg-danger">Insignia</span>
							<span class="text-danger small align-self-center">Texto destacado</span>
						</div>
					</div>
				</div>
			</div>

			<div class="col-lg-6">
				<h6>Logo</h6>
				<p class="text-body-secondary small">
					Se muestra en pantallas públicas de marca propia de tu organización (ej. la sala de espera virtual del picker de eventos).
				</p>
				<div class="card">
					<div class="card-body">
						<div class="d-flex align-items-center gap-3 mb-3">
							@if (logoUrl(); as logo) {
								<img [src]="logo" alt="" class="logo-preview" />
							} @else {
								<div class="logo-preview logo-preview-empty"><i class="bi bi-image" aria-hidden="true"></i></div>
							}
							<div class="flex-grow-1">
								<input type="file" accept="image/*" class="form-control form-control-sm" (change)="onLogoSelected($event)" [disabled]="uploadingLogo()" />
								@if (uploadingLogo()) {
									<div class="form-text">Subiendo...</div>
								}
								@if (logoUrl()) {
									<button type="button" class="btn btn-link btn-sm p-0 mt-1" [disabled]="uploadingLogo()" (click)="removeLogo()">Quitar logo</button>
								}
							</div>
						</div>
						@if (logoSaved()) {
							<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
						}
						@if (logoError()) {
							<div class="text-danger small mt-2">{{ logoError() }}</div>
						}
					</div>
				</div>
			</div>
		</div>

		<div class="row g-3 mt-1">
			@if (orgUrl(); as url) {
				<div class="col-lg-6">
					<h6>Portada pública</h6>
					<p class="text-body-secondary small">Página pública con todos los próximos eventos de tu organización — compartila con tus clientes.</p>

					@if (publicPortalBlocked()) {
						<div class="alert alert-warning">
							<i class="bi bi-lock-fill" aria-hidden="true"></i>
							Tu plan actual no incluye portada pública — el link de abajo no va a cargar hasta que
							actualices a un plan Intermedio o superior.
						</div>
					}

					<div class="card">
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
				</div>
			}

			<div class="col-lg-6">
				<h6>Pagos</h6>
				<p class="text-body-secondary small">
					Cobro online en el portal público — configura acá PayPal y/o un link de pago manual, y después elige "Cobro" al crear/editar cada evento.
				</p>

				<div class="card">
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
								[placeholder]="paypalSecretConfigured() ? '•••• configurado — déjalo vacío para no cambiarlo' : 'Pega tu Client Secret'"
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
								[placeholder]="paypalWebhookIdConfigured() ? '•••• configurado — déjalo vacío para no cambiarlo' : 'Opcional, pero recomendado'"
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
						<hr />
						<div class="mb-3">
							<label class="small mb-1">Tasa del día <span class="text-muted">(RD$ por 1 USD — se muestra junto al precio en USD en el picker público)</span></label>
							<input
								type="number"
								step="0.01"
								min="0"
								class="form-control form-control-sm"
								[value]="exchangeRateRD()"
								(input)="exchangeRateRD.set($any($event.target).value)"
								placeholder="Ej. 60.50"
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
			</div>
		</div>

		<div class="row g-3 mt-1">
			<div class="col-lg-6">
				<h6>WhatsApp</h6>
				<p class="text-body-secondary small">
					Le mandas por WhatsApp la foto de un flyer a tu número de WhatsApp Business y se crea el evento solo (IA lee la imagen, publica el
					evento y te responde por WhatsApp con un resumen). Necesitas una App de WhatsApp Business Platform en
					<a href="https://developers.facebook.com" target="_blank" rel="noopener">developers.facebook.com</a>.
				</p>

				<div class="card">
					<div class="card-body">
						@if (whatsappWebhookUrl(); as webhookUrl) {
							<div class="mb-3">
								<label class="small mb-1">URL del webhook <span class="text-muted">(pegala en Meta → WhatsApp → Configuración → Webhook)</span></label>
								<div class="input-group input-group-sm">
									<input type="text" class="form-control form-control-sm" readonly [value]="webhookUrl" />
									<button type="button" class="btn btn-outline-secondary btn-sm" (click)="copyWebhookUrl(webhookUrl)">
										<i class="bi" [class.bi-clipboard]="!webhookUrlCopied()" [class.bi-clipboard-check]="webhookUrlCopied()" aria-hidden="true"></i>
									</button>
								</div>
							</div>
						}
						<div class="mb-3">
							<label class="small mb-1">Phone Number ID <span class="text-muted">(de API Setup en tu App de Meta)</span></label>
							<input
								type="text"
								class="form-control form-control-sm"
								[value]="whatsappPhoneNumberId()"
								(input)="whatsappPhoneNumberId.set($any($event.target).value)"
								placeholder="Ej. 123456789012345"
							/>
						</div>
						<div class="mb-3">
							<label class="small mb-1">Access Token <span class="text-muted">(permanente, de un Usuario del sistema)</span></label>
							<input
								type="password"
								class="form-control form-control-sm"
								[value]="whatsappAccessToken()"
								(input)="whatsappAccessToken.set($any($event.target).value)"
								[placeholder]="whatsappAccessTokenConfigured() ? '•••• configurado — déjalo vacío para no cambiarlo' : 'Pega el token'"
							/>
						</div>
						<div class="mb-3">
							<label class="small mb-1">Verify Token <span class="text-muted">(eliges tú cualquier texto — tiene que coincidir con el que pongas en Meta)</span></label>
							<input
								type="password"
								class="form-control form-control-sm"
								[value]="whatsappVerifyToken()"
								(input)="whatsappVerifyToken.set($any($event.target).value)"
								[placeholder]="whatsappVerifyTokenConfigured() ? '•••• configurado — déjalo vacío para no cambiarlo' : 'Ej. un texto random que inventes'"
							/>
						</div>
						<div class="mb-3">
							<label class="small mb-1">App Secret <span class="text-muted">(Configuración básica de tu App de Meta — obligatorio, sin esto el webhook no procesa nada)</span></label>
							<input
								type="password"
								class="form-control form-control-sm"
								[value]="whatsappAppSecret()"
								(input)="whatsappAppSecret.set($any($event.target).value)"
								[placeholder]="whatsappAppSecretConfigured() ? '•••• configurado — déjalo vacío para no cambiarlo' : 'Obligatorio — sin esto no se procesan los mensajes'"
							/>
						</div>
						<div class="mb-3">
							<label class="small mb-1">Números autorizados <span class="text-muted">(solo estos pueden crear eventos por WhatsApp — separados por coma o espacio, con o sin +, ej. 18095551234)</span></label>
							<input
								type="text"
								class="form-control form-control-sm"
								[value]="whatsappAllowedSenders()"
								(input)="whatsappAllowedSenders.set($any($event.target).value)"
								placeholder="18095551234, 18095556789"
							/>
						</div>

						<div class="d-flex gap-2 align-items-center">
							<button type="button" class="btn btn-danger btn-sm" [disabled]="savingWhatsapp()" (click)="saveWhatsapp()">
								{{ savingWhatsapp() ? 'Guardando...' : 'Guardar' }}
							</button>
							@if (whatsappSaved()) {
								<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
							}
						</div>
						@if (whatsappError()) {
							<div class="text-danger small mt-2">{{ whatsappError() }}</div>
						}
					</div>
				</div>
			</div>

			<div class="col-lg-6">
				<h6>Reportes periódicos</h6>
				<p class="text-body-secondary small">
					El reporte del mes o trimestre anterior (ingresos, tickets vendidos, check-ins y productos) se manda automáticamente por correo el día
					que elijas.
				</p>

				<div class="card">
					<div class="card-body">
						<div class="mb-3">
							<label class="small mb-1">Frecuencia</label>
							<select class="form-select form-select-sm" [value]="reportsFrequency()" (change)="reportsFrequency.set($any($event.target).value)">
								<option value="">Desactivado</option>
								<option value="MONTHLY">Mensual</option>
								<option value="QUARTERLY">Trimestral</option>
							</select>
						</div>
						<div class="mb-3">
							<label class="small mb-1">Día del mes <span class="text-muted">(1-28, para que sea válido en todos los meses)</span></label>
							<input
								type="number"
								min="1"
								max="28"
								class="form-control form-control-sm"
								[value]="reportsDayOfMonth()"
								(input)="reportsDayOfMonth.set($any($event.target).value)"
							/>
						</div>
						<div class="mb-3">
							<label class="small mb-1">Destinatarios <span class="text-muted">(emails separados por coma)</span></label>
							<input
								type="text"
								class="form-control form-control-sm"
								[value]="reportsRecipients()"
								(input)="reportsRecipients.set($any($event.target).value)"
								placeholder="director@club.com, presidente@club.com"
							/>
						</div>

						<div class="d-flex gap-2 align-items-center">
							<button type="button" class="btn btn-danger btn-sm" [disabled]="savingReports()" (click)="saveReports()">
								{{ savingReports() ? 'Guardando...' : 'Guardar' }}
							</button>
							@if (reportsSaved()) {
								<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
							}
						</div>
						@if (reportsError()) {
							<div class="text-danger small mt-2">{{ reportsError() }}</div>
						}
					</div>
				</div>
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
	private readonly uploadsService = inject(UploadsService);

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
	// RD$ por 1 USD — a diferencia de PayPal/link, no es un secreto (viaja a GET /public/events/:code
	// tal cual, ver public.ts), así que se guarda y se lee como cualquier setting normal, sin flag
	// "Configured".
	exchangeRateRD = signal('');
	savingPayments = signal(false);
	paymentsSaved = signal(false);
	paymentsError = signal('');

	// accessTokenSecret/verifyTokenSecret/appSecretSecret nunca vuelven del backend (mismo filtro que
	// Client Secret de PayPal, ver GET /settings) — solo el flag "Configured".
	whatsappPhoneNumberId = signal('');
	whatsappAccessToken = signal('');
	whatsappAccessTokenConfigured = signal(false);
	whatsappVerifyToken = signal('');
	whatsappVerifyTokenConfigured = signal(false);
	whatsappAppSecret = signal('');
	whatsappAppSecretConfigured = signal(false);
	whatsappAllowedSenders = signal('');
	savingWhatsapp = signal(false);
	whatsappSaved = signal(false);
	whatsappError = signal('');
	webhookUrlCopied = signal(false);

	reportsFrequency = signal('');
	reportsDayOfMonth = signal('');
	reportsRecipients = signal('');
	savingReports = signal(false);
	reportsSaved = signal(false);
	reportsError = signal('');

	orgUrl = computed(() => {
		const slug = this.authService.currentUser()?.tenant?.slug;
		return slug ? `${window.location.origin}/o/${slug}` : null;
	});

	// El link de arriba existe siempre (se arma solo del slug), pero el backend lo bloquea con un
	// 404 genérico si el plan no incluye portal público (ver public.ts — a propósito indistinguible
	// de "no existe", para no confirmarle a un visitante anónimo que el slug es real) — sin este
	// aviso acá, el dueño de la organización ve el link "andar" en Settings pero no entiende por qué
	// no carga cuando lo prueba.
	publicPortalBlocked = computed(() => {
		const plan = this.authService.currentUser()?.tenant?.plan;
		if (!plan || isEventPlanCode(plan)) return false;
		return !PLAN_FEATURES[plan]?.publicPortal;
	});

	logoUrl = computed(() => this.authService.currentUser()?.tenant?.logoUrl ?? null);
	uploadingLogo = signal(false);
	logoSaved = signal(false);
	logoError = signal('');

	onLogoSelected(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		this.uploadingLogo.set(true);
		this.logoError.set('');
		this.uploadsService.uploadImage(file).subscribe({
			next: ({ url }) => this.saveLogo(`${environment.apiUrl}${url}`),
			error: (err: HttpErrorResponse) => {
				this.uploadingLogo.set(false);
				this.logoError.set(extractErrorMessage(err));
			},
		});
	}

	// Mismo patrón de confirmación que las 13+ acciones destructivas del resto de la app (borrar
	// evento/mapa/área/asiento/mesa/ticket/producto/usuario, etc.) — antes esto borraba el logo del
	// club con un solo click, sin avisar.
	removeLogo() {
		confirm('¿Quitar el logo de la organización?', {
			onConfirm: () => this.saveLogo(null),
		});
	}

	private saveLogo(logoUrl: string | null) {
		this.uploadingLogo.set(true);
		this.logoSaved.set(false);
		this.logoError.set('');
		this.settingsService.setLogo(logoUrl).subscribe({
			next: () => {
				this.uploadingLogo.set(false);
				this.logoSaved.set(true);
				// Actualiza currentUser en el momento — sin esto, el logo nuevo no se reflejaría acá (ni en
				// cualquier otra pantalla que lo use, ver public-event.component.ts) hasta el próximo login.
				const current = this.authService.currentUser();
				if (current?.tenant) {
					this.authService.currentUser.set({ ...current, tenant: { ...current.tenant, logoUrl } });
				}
				setTimeout(() => this.logoSaved.set(false), 2000);
			},
			error: (err: HttpErrorResponse) => {
				this.uploadingLogo.set(false);
				this.logoError.set(extractErrorMessage(err));
			},
		});
	}

	// El backend expone este mismo webhook bajo /public (ver routes/public.ts) — el slug del tenant en
	// la URL es lo único que identifica a qué club pertenece cada mensaje entrante, antes de leer nada
	// del body (ver el comentario en public.ts sobre /webhooks/whatsapp/:slug).
	whatsappWebhookUrl = computed(() => {
		const slug = this.authService.currentUser()?.tenant?.slug;
		return slug ? `${environment.apiUrl}/public/webhooks/whatsapp/${slug}` : null;
	});

	loadError = signal('');

	ngOnInit(): void {
		this.settingsService.getSettings().subscribe({
			next: (settings) => {
				this.accent.set(settings[ACCENT_SETTING_KEY] ?? DEFAULT_ACCENT);
				this.paypalClientId.set(settings['payments.paypalClientId'] ?? '');
				this.paypalSecretConfigured.set(settings['payments.paypalSecretConfigured'] === 'true');
				this.paypalMode.set(settings['payments.paypalMode'] === 'live' ? 'live' : 'sandbox');
				this.paypalWebhookIdConfigured.set(settings['payments.paypalWebhookIdConfigured'] === 'true');
				this.linkUrl.set(settings['payments.linkUrl'] ?? '');
				this.exchangeRateRD.set(settings['payments.exchangeRateRD'] ?? '');
				this.whatsappPhoneNumberId.set(settings['whatsapp.phoneNumberId'] ?? '');
				this.whatsappAccessTokenConfigured.set(settings['whatsapp.accessTokenSecretConfigured'] === 'true');
				this.whatsappVerifyTokenConfigured.set(settings['whatsapp.verifyTokenSecretConfigured'] === 'true');
				this.whatsappAppSecretConfigured.set(settings['whatsapp.appSecretSecretConfigured'] === 'true');
				this.whatsappAllowedSenders.set(settings['whatsapp.allowedSenders'] ?? '');
				this.reportsFrequency.set(settings['reports.frequency'] ?? '');
				this.reportsDayOfMonth.set(settings['reports.dayOfMonth'] ?? '');
				this.reportsRecipients.set(settings['reports.recipients'] ?? '');
			},
			// Sin esto, un fallo de red dejaba todos los campos en blanco/default, indistinguible de
			// "nunca configurado" — un admin podía terminar recargando credenciales de PayPal/WhatsApp
			// que en realidad ya estaban guardadas, solo no se pudieron leer en este request.
			error: (err: HttpErrorResponse) => this.loadError.set(extractErrorMessage(err)),
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
		const exchangeRateToSave = this.exchangeRateRD().trim();
		const calls: Observable<unknown>[] = [this.settingsService.setSetting('payments.paypalMode', this.paypalMode())];
		if (clientIdToSave) calls.push(this.settingsService.setSetting('payments.paypalClientId', clientIdToSave));
		if (linkUrlToSave) calls.push(this.settingsService.setSetting('payments.linkUrl', linkUrlToSave));
		if (secretToSave) calls.push(this.settingsService.setSetting('payments.paypalSecret', secretToSave));
		if (webhookIdToSave) calls.push(this.settingsService.setSetting('payments.paypalWebhookId', webhookIdToSave));
		if (exchangeRateToSave) calls.push(this.settingsService.setSetting('payments.exchangeRateRD', exchangeRateToSave));

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

	// Mismo criterio que savePayments(): solo manda los campos con contenido, para no borrar un
	// Access Token/Verify Token/App Secret ya guardado con un campo vacío por accidente.
	saveWhatsapp() {
		this.savingWhatsapp.set(true);
		this.whatsappError.set('');
		this.whatsappSaved.set(false);
		const phoneNumberIdToSave = this.whatsappPhoneNumberId().trim();
		const allowedSendersToSave = this.whatsappAllowedSenders().trim();
		const accessTokenToSave = this.whatsappAccessToken().trim();
		const verifyTokenToSave = this.whatsappVerifyToken().trim();
		const appSecretToSave = this.whatsappAppSecret().trim();
		const calls: Observable<unknown>[] = [];
		if (phoneNumberIdToSave) calls.push(this.settingsService.setSetting('whatsapp.phoneNumberId', phoneNumberIdToSave));
		if (allowedSendersToSave) calls.push(this.settingsService.setSetting('whatsapp.allowedSenders', allowedSendersToSave));
		if (accessTokenToSave) calls.push(this.settingsService.setSetting('whatsapp.accessTokenSecret', accessTokenToSave));
		if (verifyTokenToSave) calls.push(this.settingsService.setSetting('whatsapp.verifyTokenSecret', verifyTokenToSave));
		if (appSecretToSave) calls.push(this.settingsService.setSetting('whatsapp.appSecretSecret', appSecretToSave));

		if (!calls.length) {
			this.savingWhatsapp.set(false);
			return;
		}

		forkJoin(calls).subscribe({
			next: () => {
				this.savingWhatsapp.set(false);
				this.whatsappSaved.set(true);
				if (accessTokenToSave) {
					this.whatsappAccessToken.set('');
					this.whatsappAccessTokenConfigured.set(true);
				}
				if (verifyTokenToSave) {
					this.whatsappVerifyToken.set('');
					this.whatsappVerifyTokenConfigured.set(true);
				}
				if (appSecretToSave) {
					this.whatsappAppSecret.set('');
					this.whatsappAppSecretConfigured.set(true);
				}
			},
			error: (err: HttpErrorResponse) => {
				this.savingWhatsapp.set(false);
				this.whatsappError.set(extractErrorMessage(err));
			},
		});
	}

	// Igual que payments/whatsapp: PUT /settings/:key rechaza valores vacíos, así que "Desactivado"
	// (frequency = '') simplemente no se manda — un tenant que nunca configuró esto no aparece en el
	// sweep de runScheduledReportsCheck() y no recibe nada, que es el estado "apagado" real.
	saveReports() {
		this.savingReports.set(true);
		this.reportsError.set('');
		this.reportsSaved.set(false);
		const frequencyToSave = this.reportsFrequency();
		const dayOfMonthToSave = this.reportsDayOfMonth().trim();
		const recipientsToSave = this.reportsRecipients().trim();

		if (frequencyToSave && (!dayOfMonthToSave || !recipientsToSave)) {
			this.savingReports.set(false);
			this.reportsError.set('Elige un día del mes y al menos un destinatario para activar el reporte.');
			return;
		}

		const calls: Observable<unknown>[] = [];
		if (frequencyToSave) calls.push(this.settingsService.setSetting('reports.frequency', frequencyToSave));
		if (dayOfMonthToSave) calls.push(this.settingsService.setSetting('reports.dayOfMonth', dayOfMonthToSave));
		if (recipientsToSave) calls.push(this.settingsService.setSetting('reports.recipients', recipientsToSave));

		if (!calls.length) {
			this.savingReports.set(false);
			return;
		}

		forkJoin(calls).subscribe({
			next: () => {
				this.savingReports.set(false);
				this.reportsSaved.set(true);
			},
			error: (err: HttpErrorResponse) => {
				this.savingReports.set(false);
				this.reportsError.set(extractErrorMessage(err));
			},
		});
	}

	copyWebhookUrl(url: string) {
		navigator.clipboard.writeText(url).then(() => {
			this.webhookUrlCopied.set(true);
			setTimeout(() => this.webhookUrlCopied.set(false), 2000);
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
