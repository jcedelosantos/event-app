import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SignupService, SubscriptionStatus } from './services/signup.service';

const POLL_INTERVAL_MS = 3000;

@Component({
	selector: 'app-signup-confirmation',
	standalone: true,
	imports: [RouterLink],
	template: `
		<div class="page d-flex align-items-center justify-content-center" data-bs-theme="dark" style="min-height: 100vh;">
			<div class="text-center" style="max-width: 480px;">
				@switch (status()) {
					@case ('waiting') {
						<div class="spinner-border text-danger mb-3" role="status"></div>
						<h1 class="h4">Confirmando tu pago...</h1>
						<p style="color: #b9b9b9;">Esta pantalla se actualiza sola apenas PayPal confirme la suscripción — no hace falta que recargues.</p>
					}
					@case ('active') {
						<h1 class="h4 text-success">¡Tu cuenta está lista!</h1>
						<p class="mb-4" style="color: #b9b9b9;">Tu plan quedó activo. Ya podés iniciar sesión y empezar a crear tu primer evento.</p>
						<a routerLink="/login/sign-in" class="btn btn-danger">Iniciar sesión</a>
					}
					@case ('blocked') {
						<h1 class="h4 text-warning">Tu pago no se completó</h1>
						<p class="mb-4" style="color: #b9b9b9;">Tu organización ya está creada, pero la suscripción no quedó activa. Contactanos para resolverlo o intentá suscribirte de nuevo.</p>
						<a routerLink="/signup" class="btn btn-outline-danger">Volver a intentar</a>
					}
					@case ('not-found') {
						<h1 class="h4">No encontramos esta suscripción</h1>
						<p style="color: #b9b9b9;">Revisá el link o volvé a empezar el alta.</p>
					}
				}
			</div>
		</div>
	`,
	styles: `
		.page {
			background: #0a0a0a;
			color: #fff;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupConfirmationComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly signupService = inject(SignupService);
	private readonly destroyRef = inject(DestroyRef);

	status = signal<'waiting' | 'active' | 'blocked' | 'not-found'>('waiting');
	private pollIntervalId: ReturnType<typeof setInterval> | null = null;

	ngOnInit(): void {
		const tenantId = Number(this.route.snapshot.queryParamMap.get('tenant'));
		if (!tenantId) {
			this.status.set('not-found');
			return;
		}

		const poll = () => {
			this.signupService.getStatus(tenantId).subscribe({
				next: (result) => this.applyStatus(result),
				error: () => this.status.set('not-found'),
			});
		};
		poll();
		this.pollIntervalId = setInterval(poll, POLL_INTERVAL_MS);
		this.destroyRef.onDestroy(() => {
			if (this.pollIntervalId != null) clearInterval(this.pollIntervalId);
		});
	}

	private applyStatus(result: SubscriptionStatus): void {
		if (result.status === 'ACTIVE') {
			this.status.set('active');
			if (this.pollIntervalId != null) {
				clearInterval(this.pollIntervalId);
				this.pollIntervalId = null;
			}
			return;
		}
		if (result.status === 'SUSPENDED' || result.status === 'CANCELLED' || result.status === 'PAST_DUE') {
			this.status.set('blocked');
			if (this.pollIntervalId != null) {
				clearInterval(this.pollIntervalId);
				this.pollIntervalId = null;
			}
			return;
		}
		// PENDING: seguir esperando al webhook.
		this.status.set('waiting');
	}
}
