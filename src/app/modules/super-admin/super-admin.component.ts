import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { TenantService } from './services/tenant.service';
import { ServiceRequestsAdminService } from './services/service-requests-admin.service';
import { EnterpriseLeadsAdminService } from './services/enterprise-leads-admin.service';
import { SignupEventAdminService, PendingReceiptTenant } from './services/signup-event-admin.service';
import { CreateTenantModalComponent } from './components/create-tenant-modal/create-tenant-modal.component';
import { EditTenantModalComponent } from './components/edit-tenant-modal/edit-tenant-modal.component';
import { SubscriptionModalComponent } from './components/subscription-modal/subscription-modal.component';
import { InvoiceSettingsModalComponent } from './components/invoice-settings-modal/invoice-settings-modal.component';
import { ServiceRequestsAdminModalComponent } from './components/service-requests-admin-modal/service-requests-admin-modal.component';
import { BankTransferReviewModalComponent } from './components/bank-transfer-review-modal/bank-transfer-review-modal.component';
import { AccountModalComponent } from '../../shared/account-modal/account-modal.component';
import { Tenant, TENANT_TYPE_LABELS } from '../../models/tenants/tenant';
import { ServiceRequest, ServiceRequestStatus } from '../../models/service-requests/service-request';
import { EnterpriseLead } from '../../models/enterprise-leads/enterprise-lead';
import { Invoice } from '../../models/invoices/invoice';
import { PaymentReceipt } from '../../models/payment-receipts/payment-receipt';
import { EVENT_PLANS } from '../../shared/event-plans';
import { PRICING_PLANS } from '../../shared/pricing-plans';
import { AuthService } from '../../core/services/auth.service';
import { confirm, error } from '../../utils/messages';
import { extractErrorMessage } from '../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';
import { centsToDollars } from '../../shared/money';

const REQUEST_STATUS_LABEL: Record<ServiceRequestStatus, string> = {
	PENDING: 'Pendiente',
	QUOTED: 'Cotizado',
	FULFILLED: 'Resuelto',
	REJECTED: 'Rechazado',
};

@Component({
	selector: 'app-super-admin',
	imports: [
		CreateTenantModalComponent,
		EditTenantModalComponent,
		SubscriptionModalComponent,
		InvoiceSettingsModalComponent,
		ServiceRequestsAdminModalComponent,
		BankTransferReviewModalComponent,
		AccountModalComponent,
		DatePipe,
		DecimalPipe,
	],
	template: `
		<div class="container-fluid py-4" data-bs-theme="dark">
			<div class="d-flex justify-content-between align-items-center mb-4">
				<div>
					<h2 class="section-title mb-0" style="color: #e2e8f0;">
						Organizaciones
						@if (totalPendingReviewCount() > 0) {
							<button type="button" class="btn badge text-bg-warning ms-2 border-0" (click)="scrollToPending()">
								<i class="bi bi-bell-fill"></i> {{ totalPendingReviewCount() }} pendiente{{ totalPendingReviewCount() === 1 ? '' : 's' }} de revisar
							</button>
						}
					</h2>
					<p class="text-muted small mb-0">Panel de Super Admin — alta de clubes/iglesias que usan la plataforma.</p>
				</div>
				<div class="d-flex gap-2 align-items-center">
					@if (archivedCount() > 0) {
						<div class="form-check form-switch me-2">
							<input class="form-check-input" type="checkbox" id="showArchivedSwitch" [checked]="showArchived()" (change)="showArchived.set(!showArchived())" />
							<label class="form-check-label small text-muted" for="showArchivedSwitch">Mostrar archivadas ({{ archivedCount() }})</label>
						</div>
					}
					<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createTenantModal">
						<i class="bi bi-plus-lg"></i> Nueva organización
					</button>
					<button
						type="button"
						class="btn btn-outline-secondary"
						data-bs-toggle="modal"
						data-bs-target="#invoiceSettingsModal"
						(click)="invoiceSettingsModal.onOpen()"
					>
						<i class="bi bi-receipt"></i> Config. facturación
					</button>
					<button type="button" class="btn btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#accountModal">
						<i class="bi bi-person-circle"></i> Mi cuenta
					</button>
					<button type="button" class="btn btn-outline-secondary" (click)="logout()"><i class="bi bi-box-arrow-left"></i> Salir</button>
				</div>
			</div>

			<div class="table-responsive">
			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col">Organización</th>
						<th scope="col">Tipo</th>
						<th scope="col">Slug</th>
						<th scope="col">Usuarios</th>
						<th scope="col">Eventos</th>
						<th scope="col">Creada</th>
						<th scope="col">Estado</th>
						<th scope="col">Plan</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (tenant of visibleTenants(); track tenant.id) {
						<tr>
							<td>{{ tenant.name }}</td>
							<td>
								<span class="badge text-bg-secondary">{{ tenantTypeLabels[tenant.type] }}</span>
							</td>
							<td class="text-muted">{{ tenant.slug }}</td>
							<td>{{ tenant._count?.users ?? 0 }}</td>
							<td>{{ tenant._count?.events ?? 0 }}</td>
							<td class="text-muted">{{ tenant.createdAt | date: 'mediumDate' }}</td>
							<td>
								@if (tenant.planStatus === 'ARCHIVED') {
									<span class="badge text-bg-dark"><i class="bi bi-archive-fill"></i> Archivada</span>
								} @else {
									<span class="badge" [class.text-bg-success]="tenant.active" [class.text-bg-secondary]="!tenant.active">
										{{ tenant.active ? 'Activa' : 'Inactiva' }}
									</span>
								}
							</td>
							<td>
								@if (tenant.plan) {
									<button
										type="button"
										class="btn btn-sm btn-outline-light plan-btn d-flex justify-content-between align-items-center"
										data-bs-toggle="modal"
										data-bs-target="#subscriptionModal"
										(click)="selectedSubscriptionTenant.set(tenant)"
									>
										<span>{{ tenant.plan }}</span>
										<span
											class="badge ms-2"
											[class.text-bg-success]="tenant.planStatus === 'ACTIVE'"
											[class.text-bg-warning]="tenant.planStatus === 'PAST_DUE' || tenant.planStatus === 'PENDING'"
											[class.text-bg-secondary]="tenant.planStatus === 'SUSPENDED' || tenant.planStatus === 'CANCELLED'"
										>
											{{ tenant.planStatus }}
										</span>
									</button>
								} @else {
									<span class="text-muted small plan-empty d-inline-block">sin suscripción</span>
								}
							</td>
							<td class="text-end text-nowrap">
								<button type="button" class="btn btn-sm btn-outline-primary me-1" (click)="enterTenant(tenant)">
									<i class="bi bi-box-arrow-in-right"></i> Entrar
								</button>
								<button
									type="button"
									class="btn btn-sm btn-outline-light me-1"
									data-bs-toggle="modal"
									data-bs-target="#editTenantModal"
									(click)="selectedTenant.set(tenant)"
								>
									<i class="bi bi-pencil"></i>
								</button>
								@if (tenant.planStatus === 'ARCHIVED') {
									<button type="button" class="btn btn-sm btn-outline-warning" (click)="reactivateTenant(tenant)">
										<i class="bi bi-arrow-counterclockwise"></i> Reactivar
									</button>
								} @else {
									<button type="button" class="btn btn-sm toggle-active-btn" [class.btn-outline-danger]="tenant.active" [class.btn-outline-success]="!tenant.active" (click)="toggleActive(tenant)">
										{{ tenant.active ? 'Desactivar' : 'Activar' }}
									</button>
								}
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="9" class="text-center text-muted py-4">
								{{ archivedCount() > 0 && !showArchived() ? 'Todas las organizaciones están archivadas — activa el toggle para verlas.' : 'Todavía no hay organizaciones creadas.' }}
							</td>
						</tr>
					}
				</tbody>
			</table>
			</div>

			<div id="enterpriseLeadsSection" class="d-flex justify-content-between align-items-center mb-3 mt-5">
				<div>
					<h2 class="section-title mb-0">
						Contactos Pro Enterprise
						@if (pendingEnterpriseLeadsCount() > 0) {
							<span class="badge text-bg-warning ms-2">{{ pendingEnterpriseLeadsCount() }} sin revisar</span>
						}
					</h2>
					<p class="text-muted small mb-0">Prospectos que pidieron que los contactemos desde la portada — sin alta automática, se cotiza y da de alta a mano.</p>
				</div>
			</div>
			<div class="table-responsive">
			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col">Organización</th>
						<th scope="col">Contacto</th>
						<th scope="col">Email</th>
						<th scope="col">Teléfono</th>
						<th scope="col">Mensaje</th>
						<th scope="col">Fecha</th>
						<th scope="col">Estado</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (lead of enterpriseLeads(); track lead.id) {
						<tr>
							<td>{{ lead.orgName }}</td>
							<td>{{ lead.contactName }}</td>
							<td class="text-muted">{{ lead.email }}</td>
							<td class="text-muted">{{ lead.phone || '—' }}</td>
							<td class="text-muted small">{{ lead.message || '—' }}</td>
							<td class="text-muted">{{ lead.createdAt | date: 'short' }}</td>
							<td>
								<span class="badge" [class.text-bg-success]="lead.contactedAt" [class.text-bg-secondary]="!lead.contactedAt">
									{{ lead.contactedAt ? 'Contactado' : 'Pendiente' }}
								</span>
							</td>
							<td class="text-end">
								@if (!lead.contactedAt) {
									<button type="button" class="btn btn-sm btn-outline-light" (click)="markLeadContacted(lead)">
										<i class="bi bi-check-lg"></i> Marcar contactado
									</button>
								}
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="8" class="text-center text-muted py-4">Todavía no hay contactos de Pro Enterprise.</td>
						</tr>
					}
				</tbody>
			</table>
			</div>

			<h2 class="section-title mb-0 mt-5" style="color: #e2e8f0;">Facturación</h2>
			<p class="text-muted small mb-4">Facturas que INTEG le emite a cada organización, comprobantes de pago que mandan, y cotizaciones de servicios adicionales.</p>

			<div class="d-flex justify-content-between align-items-center mb-3">
				<h5 class="mb-0">Facturas emitidas</h5>
			</div>
			<div class="table-responsive">
			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col">Organización</th>
						<th scope="col">Período</th>
						<th scope="col">N° factura</th>
						<th scope="col">NCF</th>
						<th scope="col" class="text-end">Total</th>
						<th scope="col">Fecha</th>
						<th scope="col">Estado</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (inv of invoices(); track inv.id) {
						<tr>
							<td>{{ inv.tenant?.name }}</td>
							<td class="text-muted">{{ inv.billingPeriod }}</td>
							<td class="text-muted">{{ inv.invoiceNumber }}</td>
							<td class="text-muted">{{ inv.ncf ?? '—' }}</td>
							<td class="text-end">USD {{ centsToDollars(inv.totalCents) | number: '1.2-2' }}</td>
							<td class="text-muted">{{ inv.createdAt | date: 'short' }}</td>
							<td>
								<span
									class="badge"
									[class.text-bg-success]="inv.status === 'GENERATED'"
									[class.text-bg-secondary]="inv.status === 'PENDING'"
									[class.text-bg-danger]="inv.status === 'FAILED'"
								>
									{{ inv.status }}
								</span>
							</td>
							<td class="text-end">
								@if (inv.pdfUrl) {
									<a class="btn btn-sm btn-outline-light" [href]="inv.pdfUrl" target="_blank" rel="noopener">
										<i class="bi bi-download"></i> Descargar
									</a>
								}
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="8" class="text-center text-muted py-4">Todavía no hay facturas emitidas.</td>
						</tr>
					}
				</tbody>
			</table>
			</div>

			<div id="pendingReceiptsSection" class="d-flex justify-content-between align-items-center mb-3 mt-4">
				<div>
					<h5 class="mb-0">
						Comprobantes recibidos
						@if (pendingReceipts().length > 0) {
							<span class="badge text-bg-warning ms-2">{{ pendingReceipts().length }} sin revisar</span>
						}
					</h5>
					<p class="text-muted small mb-0">Evento único o suscripción recurrente pagados por transferencia — confirma el pago a mano para activar la cuenta.</p>
				</div>
			</div>
			<div class="table-responsive">
			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col">Organización</th>
						<th scope="col">Plan</th>
						<th scope="col" class="text-end">Monto</th>
						<th scope="col">Enviado</th>
						<th scope="col">Estado</th>
						<th scope="col">Revisado</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (r of receipts(); track r.id) {
						<tr>
							<td>{{ r.tenant.name }}</td>
							<td class="text-muted">{{ tierName(r.planCode) }}</td>
							<td class="text-end">USD {{ centsToDollars(r.amountCents) | number: '1.2-2' }}</td>
							<td class="text-muted">{{ r.submittedAt | date: 'short' }}</td>
							<td>
								<span
									class="badge"
									[class.text-bg-secondary]="r.status === 'PENDING'"
									[class.text-bg-success]="r.status === 'APPROVED'"
									[class.text-bg-danger]="r.status === 'REJECTED'"
								>
									{{ r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobado' : 'Rechazado' }}
								</span>
							</td>
							<td class="text-muted">{{ r.reviewedAt ? (r.reviewedAt | date: 'short') : '—' }}</td>
							<td class="text-end">
								@if (r.status === 'PENDING') {
									<button
										type="button"
										class="btn btn-sm btn-outline-light"
										data-bs-toggle="modal"
										data-bs-target="#bankTransferReviewModal"
										(click)="openReceiptReview(r)"
									>
										<i class="bi bi-image"></i> Gestionar
									</button>
								} @else {
									<a class="btn btn-sm btn-outline-light" [href]="r.url" target="_blank" rel="noopener">
										<i class="bi bi-image"></i> Ver comprobante
									</a>
								}
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="7" class="text-center text-muted py-4">Todavía no hay comprobantes.</td>
						</tr>
					}
				</tbody>
			</table>
			</div>

			<div id="serviceRequestsSection" class="d-flex justify-content-between align-items-center mb-3 mt-4">
				<div>
					<h5 class="mb-0">
						Cotizaciones de servicios adicionales
						@if (pendingServiceRequestsCount() > 0) {
							<span class="badge text-bg-warning ms-2">{{ pendingServiceRequestsCount() }} sin revisar</span>
						}
					</h5>
					<p class="text-muted small mb-0">Renta de equipos, personal presencial y demás — cotizar/coordinar y marcar el estado acá.</p>
				</div>
			</div>
			<div class="table-responsive">
			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col" style="max-width: 140px;">Organización</th>
						<th scope="col" style="max-width: 160px;">Evento</th>
						<th scope="col" style="min-width: 320px;">Servicios</th>
						<th scope="col" class="text-end">Total estimado</th>
						<th scope="col">Fecha</th>
						<th scope="col">Estado</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (r of serviceRequests(); track r.id) {
						<tr>
							<td class="text-truncate" style="max-width: 140px;" [title]="r.tenant?.name ?? ''">{{ r.tenant?.name }}</td>
							<td class="text-muted text-truncate" style="max-width: 160px;" [title]="r.event?.name ?? ''">{{ r.event?.name ?? '—' }}</td>
							<td>
								@for (item of r.items; track item.id) {
									<div class="small">{{ item.nameSnapshot }} × {{ item.quantity }}</div>
								}
							</td>
							<td class="text-end">$ {{ r.totalDOP | number }}</td>
							<td class="text-muted">{{ r.createdAt | date: 'short' }}</td>
							<td>
								<span
									class="badge"
									[class.text-bg-secondary]="r.status === 'PENDING'"
									[class.text-bg-info]="r.status === 'QUOTED'"
									[class.text-bg-success]="r.status === 'FULFILLED'"
									[class.text-bg-danger]="r.status === 'REJECTED'"
								>
									{{ statusLabel(r.status) }}
								</span>
							</td>
							<td class="text-end">
								<button
									type="button"
									class="btn btn-sm btn-outline-light"
									data-bs-toggle="modal"
									data-bs-target="#serviceRequestsAdminModal"
									(click)="selectedServiceRequest.set(r)"
								>
									<i class="bi bi-pencil"></i> Gestionar
								</button>
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="7" class="text-center text-muted py-4">Todavía no hay solicitudes de servicios.</td>
						</tr>
					}
				</tbody>
			</table>
			</div>
		</div>
		<app-create-tenant-modal (tenantCreated)="loadTenants()" />
		<app-edit-tenant-modal [(tenant)]="selectedTenant" (tenantUpdated)="loadTenants()" />
		<app-subscription-modal [(tenant)]="selectedSubscriptionTenant" (subscriptionChanged)="loadTenants()" />
		<app-invoice-settings-modal #invoiceSettingsModal />
		<app-service-requests-admin-modal [(request)]="selectedServiceRequest" (requestUpdated)="loadServiceRequests()" />
		<app-bank-transfer-review-modal [(tenant)]="selectedReceiptTenant" (reviewed)="onReceiptReviewed()" />
		<app-account-modal />
	`,
	styles: `
		/* Ancho fijo para que el botón no cambie de tamaño según el plan (INTERMEDIO vs BASICO) ni
		   el estado (ACTIVE vs PENDING) — antes cada fila tenía un ancho distinto y la columna de
		   acciones (Entrar/lápiz/Activar-Desactivar) quedaba dando bandazos. */
		.plan-btn,
		.plan-empty {
			min-width: 168px;
			text-align: left;
		}
		/* Mismo criterio — "Desactivar" es más largo que "Activar", sin esto el botón (y por lo
		   tanto el resto de la fila) angostaba/ensanchaba según el estado de cada organización. */
		.toggle-active-btn {
			min-width: 104px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminComponent implements AfterViewInit {
	private readonly tenantService = inject(TenantService);
	private readonly serviceRequestsAdminSrv = inject(ServiceRequestsAdminService);
	private readonly enterpriseLeadsAdminSrv = inject(EnterpriseLeadsAdminService);
	private readonly signupEventAdminSrv = inject(SignupEventAdminService);
	private readonly authService = inject(AuthService);
	private readonly router = inject(Router);

	tenants = signal<Tenant[]>([]);
	tenantTypeLabels = TENANT_TYPE_LABELS;
	readonly centsToDollars = centsToDollars;
	selectedTenant = signal<Tenant | null>(null);
	selectedSubscriptionTenant = signal<Tenant | null>(null);

	// ARCHIVED (ver lib/event-plan-expiry.ts en la API) se oculta por default de la lista principal —
	// son organizaciones inactivas hace 30+ días, no algo que el Super Admin necesite ver a diario.
	// El toggle es solo para auditoría/reactivación manual, nunca automático.
	showArchived = signal(false);
	archivedCount = computed(() => this.tenants().filter((t) => t.planStatus === 'ARCHIVED').length);
	visibleTenants = computed(() => (this.showArchived() ? this.tenants() : this.tenants().filter((t) => t.planStatus !== 'ARCHIVED')));

	serviceRequests = signal<ServiceRequest[]>([]);
	selectedServiceRequest = signal<ServiceRequest | null>(null);

	enterpriseLeads = signal<EnterpriseLead[]>([]);

	pendingReceipts = signal<PendingReceiptTenant[]>([]);
	selectedReceiptTenant = signal<PendingReceiptTenant | null>(null);

	invoices = signal<Invoice[]>([]);
	// Histórico completo (pendientes + revisados) para la tabla "Comprobantes recibidos" — distinto
	// de pendingReceipts de arriba, que sigue siendo solo la cola de pendientes (usada para el badge
	// del header y para disparar el modal de revisión, sin tocar esa lógica).
	receipts = signal<PaymentReceipt[]>([]);

	// Suma de las 3 colas que requieren acción del Super Admin — se usa tanto para el badge general
	// del encabezado como, cada una por separado, para el badge de su propia sección.
	pendingServiceRequestsCount = computed(() => this.serviceRequests().filter((r) => r.status === 'PENDING').length);
	pendingEnterpriseLeadsCount = computed(() => this.enterpriseLeads().filter((l) => !l.contactedAt).length);
	totalPendingReviewCount = computed(() => this.pendingServiceRequestsCount() + this.pendingEnterpriseLeadsCount() + this.pendingReceipts().length);

	statusLabel(status: ServiceRequestStatus): string {
		return REQUEST_STATUS_LABEL[status];
	}

	// Esta cola atiende comprobantes de AMBOS flujos de transferencia bancaria — evento único
	// (códigos EVENT_*) y suscripción recurrente (BASICO/INTERMEDIO/AVANZADO) — ver el comentario en
	// GET /signup-event/admin (api/src/routes/signup-event.ts) sobre por qué es la misma cola.
	tierName(plan: string): string {
		return EVENT_PLANS.find((t) => t.code === plan)?.name ?? PRICING_PLANS.find((p) => p.code === plan)?.name ?? plan;
	}

	// Devuelve dólares (no centavos) — se muestra directo en el template.
	tierPrice(plan: string): number {
		return centsToDollars(EVENT_PLANS.find((t) => t.code === plan)?.priceCents ?? PRICING_PLANS.find((p) => p.code === plan)?.priceCents ?? 0);
	}

	loadServiceRequests() {
		this.serviceRequestsAdminSrv.getAll().subscribe((requests) => this.serviceRequests.set(requests));
	}

	loadEnterpriseLeads() {
		this.enterpriseLeadsAdminSrv.getAll().subscribe((leads) => this.enterpriseLeads.set(leads));
	}

	markLeadContacted(lead: EnterpriseLead) {
		this.enterpriseLeadsAdminSrv.markContacted(lead.id).subscribe({
			next: () => this.loadEnterpriseLeads(),
			error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
		});
	}

	// Baja hasta la PRIMERA sección con pendientes, en el mismo orden en que aparecen en la página
	// — así el badge del header siempre lleva a algo relevante, sin importar cuál de las 3 tenga
	// items sin revisar.
	scrollToPending() {
		const sectionId = this.pendingServiceRequestsCount() > 0 ? 'serviceRequestsSection' : this.pendingEnterpriseLeadsCount() > 0 ? 'enterpriseLeadsSection' : 'pendingReceiptsSection';
		document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	loadPendingReceipts() {
		this.signupEventAdminSrv.getAll().subscribe((tenants) => this.pendingReceipts.set(tenants));
	}

	loadInvoices() {
		this.tenantService.getAllInvoices().subscribe((invoices) => this.invoices.set(invoices));
	}

	loadReceipts() {
		this.signupEventAdminSrv.getAllReceipts().subscribe((receipts) => this.receipts.set(receipts));
	}

	// El modal de revisión (BankTransferReviewModalComponent) espera un PendingReceiptTenant — se
	// arma acá desde la fila de PaymentReceipt (distinto shape) en vez de duplicar el modal.
	openReceiptReview(receipt: PaymentReceipt) {
		this.selectedReceiptTenant.set({
			id: receipt.tenantId,
			name: receipt.tenant.name,
			slug: '',
			plan: receipt.planCode,
			paymentReceiptUrl: receipt.url,
			createdAt: receipt.submittedAt,
		});
	}

	// Se dispara al cerrar el modal de revisión — refresca tanto la cola de pendientes (badge del
	// header) como el histórico completo (para que la fila recién revisada pase de Pendiente a
	// Aprobado/Rechazado en la tabla sin necesidad de recargar la página).
	onReceiptReviewed() {
		this.loadPendingReceipts();
		this.loadReceipts();
	}

	ngAfterViewInit(): void {
		// Los modales se abren con el data-API de Bootstrap (data-bs-toggle/data-bs-target), NO con
		// .show() programático — así el botón "Guardar" de cada modal puede cerrarlo con la misma
		// utilidad closeModal() (utils/modal.ts) que usa el resto de la app. closeModal() busca la
		// instancia vía el bootstrap GLOBAL (cargado como <script> en angular.json), que es un
		// registro completamente aparte del `import * as bootstrap from 'bootstrap'` de este archivo
		// — un modal abierto con `new bootstrap.Modal(...)` de ESTE import nunca aparece en el
		// registro global, así que closeModal() no lo encuentra y el modal se queda abierto (el
		// guardado sí funciona, solo que la ventana no se cierra). El data-API sí crea su instancia
		// en el registro global, por eso funciona.
		this.loadTenants();
		this.loadServiceRequests();
		this.loadEnterpriseLeads();
		this.loadPendingReceipts();
		this.loadInvoices();
		this.loadReceipts();
	}

	loadTenants() {
		this.tenantService.getTenants().subscribe((tenants) => this.tenants.set(tenants));
	}

	toggleActive(tenant: Tenant) {
		const nextState = !tenant.active;
		confirm(`¿${nextState ? 'Activar' : 'Desactivar'} "${tenant.name}"?`, {
			onConfirm: () =>
				this.tenantService.setActive(tenant.id, nextState).subscribe({
					next: () => this.loadTenants(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				}),
		});
	}

	// Ver comentario de POST /tenants/:id/reactivate en la API — vuelve a ACTIVE a mano, el cron
	// diario la vuelve a archivar si nadie le carga un evento nuevo.
	reactivateTenant(tenant: Tenant) {
		confirm(`¿Reactivar "${tenant.name}"? Vuelve a poder entrar y usar la plataforma.`, {
			onConfirm: () =>
				this.tenantService.reactivate(tenant.id).subscribe({
					next: () => this.loadTenants(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				}),
		});
	}

	// "Entrar" impersona al admin de la organización elegida y te manda a su gestor de eventos —
	// tu propia cuenta Super Admin no pertenece a ningún tenant, así que no tiene datos propios que
	// gestionar ahí. El banner de "Volver a Super Admin" (ver app.component) permite regresar sin
	// tener que loguearte de nuevo.
	enterTenant(tenant: Tenant) {
		this.tenantService.impersonate(tenant.id).subscribe({
			next: ({ token, user }) => {
				this.authService.beginImpersonation(token, user);
				this.router.navigate(['/manager/dash-board']);
			},
			error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
		});
	}

	logout() {
		this.authService.logout();
		this.router.navigate(['/site-web']);
	}
}
