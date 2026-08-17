import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth.service';
import { SubscriptionService } from './subscription.service';
import { PLANS_BY_CODE, PlanCode } from '../../../shared/pricing-plans';
import { centsToDollars } from '../../../shared/money';
import { EventPlanCode } from '../../../shared/event-plans';
import { extractErrorMessage } from '../../../utils/api-error';

const STATUS_LABEL: Record<string, string> = {
	PENDING: 'Pendiente de pago',
	ACTIVE: 'Activa',
	PAST_DUE: 'Pago vencido',
	SUSPENDED: 'Suspendida',
	CANCELLED: 'Cancelada',
	// Propio de un tenant de evento único (ver shared/event-plans.ts) — su evento ya pasó, quedó en
	// modo de solo consulta (ver active-subscription.guard.ts).
	EVENT_ENDED: 'Modo consulta',
	// Propio de un tenant de evento único que pagó por transferencia (ver signup-event.component.ts)
	// — subió el comprobante, espera que el Super Admin lo confirme a mano.
	PENDING_REVIEW: 'Comprobante en revisión',
};

// Cuánto tiempo esperar a que BILLING.SUBSCRIPTION.UPDATED confirme el nuevo plan tras volver de
// PayPal (ver ?upgraded=1 en la URL) antes de dejar de pollear — el webhook normalmente llega en
// segundos, pero no hay garantía de un tiempo exacto.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 60000;

// Comprobante de transferencia: el Super Admin lo confirma a mano desde /super-admin, sin ningún
// webhook que avise al frontend — sin este poll, un tenant que se queda en esta pantalla ve el
// estado PENDING_REVIEW viejo hasta que recargue la página a mano (reportado tras probar el flujo
// real). Intervalo más largo y sin timeout: a diferencia del upgrade de PayPal (segundos), una
// revisión manual puede tardar minutos u horas, y no tiene sentido pedir /auth/me cada 3s por eso.
const REVIEW_POLL_INTERVAL_MS = 10000;

@Component({
	selector: 'app-subscription',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<h2 class="section-title">Tu suscripción</h2>

		@if (tenant(); as tenant) {
			@if (tenant.planStatus !== 'ACTIVE') {
				<div
					class="alert"
					[class.alert-info]="tenant.planStatus === 'EVENT_ENDED' || tenant.planStatus === 'PENDING_REVIEW'"
					[class.alert-warning]="tenant.planStatus === 'PENDING' || tenant.planStatus === 'PAST_DUE'"
					[class.alert-danger]="tenant.planStatus === 'SUSPENDED' || tenant.planStatus === 'CANCELLED'"
				>
					<strong>{{ statusLabel(tenant.planStatus) }}.</strong>
					@if (tenant.planStatus === 'PENDING') {
						Todavía no confirmamos tu primer pago — no vas a poder crear ni editar nada hasta que se
						active. Si ya pagaste y sigues viendo esto, espera unos segundos o contactanos.
					} @else if (tenant.planStatus === 'PENDING_REVIEW') {
						Tu comprobante de transferencia está en revisión — te confirmamos por correo apenas lo
						validemos. No vas a poder crear ni editar nada hasta entonces.
					} @else if (tenant.planStatus === 'EVENT_ENDED') {
						Tu evento ya finalizó — puedes seguir viendo tu dashboard, historial y reportes, pero no
						crear ni vender nada nuevo. Actualízate a un plan recurrente abajo para seguir usando la
						plataforma con normalidad.
					} @else {
						No vas a poder crear ni editar nada mientras tu cuenta esté en este estado. Actualizá tu
						plan o método de pago abajo, o contactanos para regularizarla.
					}
				</div>
			}

			@if (upgradeConfirming()) {
				<div class="alert alert-info d-flex align-items-center gap-2">
					<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
					Confirmando tu nuevo plan con PayPal...
				</div>
			}

			<div class="card" style="max-width: 480px;">
				<div class="card-body">
					<div class="d-flex align-items-center gap-2 mb-1">
						<span class="fw-semibold fs-5">{{ planName(tenant.plan) }}</span>
						<span
							class="badge"
							[class.text-bg-success]="tenant.planStatus === 'ACTIVE'"
							[class.text-bg-info]="tenant.planStatus === 'EVENT_ENDED' || tenant.planStatus === 'PENDING_REVIEW'"
							[class.text-bg-warning]="tenant.planStatus === 'PAST_DUE' || tenant.planStatus === 'PENDING'"
							[class.text-bg-secondary]="tenant.planStatus === 'SUSPENDED' || tenant.planStatus === 'CANCELLED'"
						>
							{{ statusLabel(tenant.planStatus) }}
						</span>
					</div>
					<p class="text-body-secondary small mb-3">USD {{ priceOf(tenant.plan) }}/mes — hasta {{ attendeesOf(tenant.plan) }} asistentes por evento.</p>

					<hr />

					<label class="form-label small text-body-secondary" for="plan-select">Cambiar a</label>
					<select id="plan-select" class="form-select mb-3" [value]="selectedPlan()" (change)="onSelectPlan($event)">
						@for (plan of otherPlans(tenant.plan); track plan.code) {
							<option [value]="plan.code">{{ plan.name }} — USD {{ centsToDollars(plan.priceCents) }}/mes</option>
						}
					</select>

					<button type="button" class="btn btn-danger" [disabled]="upgrading() || upgradeConfirming()" (click)="upgrade()">
						{{ upgrading() ? 'Redirigiendo a PayPal...' : 'Actualizar ahora' }}
					</button>

					@if (errorMessage()) {
						<div class="text-danger small mt-2">{{ errorMessage() }}</div>
					}
					<p class="text-body-secondary small mt-3 mb-0">
						PayPal puede pedirte que re-apruebes el nuevo monto — el cambio queda confirmado apenas lo hagas.
					</p>
				</div>
			</div>
		}
	`,
})
export class SubscriptionComponent {
	private readonly authService = inject(AuthService);
	private readonly subscriptionService = inject(SubscriptionService);
	private readonly route = inject(ActivatedRoute);
	private readonly destroyRef = inject(DestroyRef);
	readonly centsToDollars = centsToDollars;

	tenant = computed(() => this.authService.currentUser()?.tenant ?? null);
	selectedPlan = signal<PlanCode | null>(null);
	upgrading = signal(false);
	upgradeConfirming = signal(false);
	errorMessage = signal<string | null>(null);

	private pollTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		// Esta pantalla es alcanzable con un link directo (ej. compartido, o guardado en favoritos) —
		// no hay garantía de que algún otro componente ya haya disparado la hidratación de
		// currentUser() desde /auth/me (ver AuthService), así que la pedimos acá explícitamente en
		// vez de asumirla.
		this.authService.ensureCurrentUser().subscribe(() => {
			if (this.tenant()?.planStatus === 'PENDING_REVIEW') {
				this.pollForReviewOutcome();
			}
		});

		// Volvimos de aprobar el cambio en PayPal (return_url = /manager/suscripcion?upgraded=1) — el
		// plan local todavía tiene el valor VIEJO hasta que BILLING.SUBSCRIPTION.UPDATED confirme.
		if (this.route.snapshot.queryParamMap.get('upgraded') === '1') {
			this.pollForConfirmation();
		}
		this.destroyRef.onDestroy(() => this.stopPolling());
	}

	// PlanCode | EventPlanCode: un tenant de evento único (ver shared/event-plans.ts) también pasa
	// por acá al llegar a esta pantalla — PLANS_BY_CODE no tiene su código, así que cae al fallback
	// (nombre/0), y otherPlans() de abajo termina mostrando los 4 planes recurrentes como opciones
	// (ninguno coincide con un código EVENT_*), que es exactamente lo que se necesita para poder
	// "actualizar" a uno.
	planName(code: PlanCode | EventPlanCode | null): string {
		return code ? (PLANS_BY_CODE[code as PlanCode]?.name ?? code) : '';
	}
	// Devuelve dólares (no centavos) — llamado directo desde el template, mismo criterio que el resto
	// de los getters de esta clase.
	priceOf(code: PlanCode | EventPlanCode | null): number {
		return code ? centsToDollars(PLANS_BY_CODE[code as PlanCode]?.priceCents ?? 0) : 0;
	}
	attendeesOf(code: PlanCode | EventPlanCode | null): number {
		return code ? (PLANS_BY_CODE[code as PlanCode]?.attendeesPerEvent ?? 0) : 0;
	}
	statusLabel(status: string | null): string {
		return status ? (STATUS_LABEL[status] ?? status) : '';
	}
	otherPlans(current: PlanCode | EventPlanCode | null) {
		return Object.values(PLANS_BY_CODE).filter((p) => p.code !== current);
	}

	onSelectPlan(event: Event) {
		this.selectedPlan.set((event.target as HTMLSelectElement).value as PlanCode);
	}

	upgrade() {
		const current = this.tenant()?.plan ?? null;
		const target = this.selectedPlan() ?? this.otherPlans(current)[0]?.code;
		if (!target) return;

		this.errorMessage.set(null);
		this.upgrading.set(true);
		this.subscriptionService.upgrade(target).subscribe({
			next: ({ approveUrl }) => {
				if (approveUrl) {
					window.location.href = approveUrl;
					return;
				}
				this.upgrading.set(false);
				this.pollForConfirmation();
			},
			error: (err: HttpErrorResponse) => {
				this.upgrading.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}

	private pollForConfirmation() {
		this.upgradeConfirming.set(true);
		const startedAt = Date.now();
		this.pollTimer = setInterval(() => {
			if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
				this.stopPolling();
				return;
			}
			this.authService.refreshCurrentUser().subscribe(() => {
				if (this.tenant()?.plan === this.selectedPlan()) {
					this.stopPolling();
				}
			});
		}, POLL_INTERVAL_MS);
	}

	private pollForReviewOutcome() {
		this.pollTimer = setInterval(() => {
			this.authService.refreshCurrentUser().subscribe(() => {
				if (this.tenant()?.planStatus !== 'PENDING_REVIEW') {
					this.stopPolling();
				}
			});
		}, REVIEW_POLL_INTERVAL_MS);
	}

	private stopPolling() {
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollTimer = null;
		this.upgradeConfirming.set(false);
	}
}
