import { AfterViewInit, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import * as bootstrap from 'bootstrap';
import { DatePipe } from '@angular/common';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKey, CreatedApiKey } from '../../../models/api-keys/api-key';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';

@Component({
	selector: 'app-api-keys',
	imports: [DatePipe],
	template: `
		<h2 class="section-title">API</h2>
		<p class="text-body-secondary small">
			Acceso de solo lectura para que un sistema propio (ERP, BI, automatizaciones) consulte tus eventos y ventas — sin pasar por el manager.
		</p>

		<div class="card mb-3">
			<div class="card-body">
				<h6>Base URL</h6>
				<div class="input-group input-group-sm mb-3" style="max-width: 480px">
					<input type="text" class="form-control form-control-sm" readonly [value]="apiBaseUrl" />
					<button type="button" class="btn btn-outline-secondary btn-sm" (click)="copy(apiBaseUrl, 'baseUrl')">
						<i class="bi" [class.bi-clipboard]="copied() !== 'baseUrl'" [class.bi-clipboard-check]="copied() === 'baseUrl'" aria-hidden="true"></i>
					</button>
				</div>
				<p class="small text-body-secondary mb-1">Cada request lleva la clave en el header <code>Authorization: Bearer &lt;tu-api-key&gt;</code>. Endpoints disponibles:</p>
				<ul class="small text-body-secondary mb-0">
					<li><code>GET /events</code> — lista paginada (<code>?page=</code>, <code>?limit=</code>, máx. 100)</li>
					<li><code>GET /events/:id</code> — detalle de un evento</li>
					<li><code>GET /events/:id/tickets</code> — ventas de ese evento (paginado)</li>
				</ul>
			</div>
		</div>

		<div class="card mb-3">
			<div class="card-body">
				<h6>Nueva API key</h6>
				<div class="input-group input-group-sm" style="max-width: 480px">
					<input #nameInput type="text" class="form-control form-control-sm" placeholder="Ej. Integración ERP" (keyup.enter)="createApiKey(nameInput.value); nameInput.value = ''" />
					<button type="button" class="btn btn-danger btn-sm" [disabled]="creating()" (click)="createApiKey(nameInput.value); nameInput.value = ''">
						{{ creating() ? 'Generando...' : 'Generar' }}
					</button>
				</div>
				@if (createError()) {
					<div class="text-danger small mt-2">{{ createError() }}</div>
				}
			</div>
		</div>

		<table class="table table-hover table-sm align-middle">
			<thead>
				<tr>
					<th scope="col">Nombre</th>
					<th scope="col">Clave</th>
					<th scope="col">Estado</th>
					<th scope="col">Creada</th>
					<th scope="col">Último uso</th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				@for (apiKey of apiKeys(); track apiKey.id) {
					<tr>
						<td>{{ apiKey.name }}</td>
						<td><code>{{ apiKey.keyPrefix }}…</code></td>
						<td>
							@if (apiKey.active) {
								<span class="badge text-bg-success">Activa</span>
							} @else {
								<span class="badge text-bg-secondary">Revocada</span>
							}
						</td>
						<td>{{ apiKey.createdAt | date: 'short' }}</td>
						<td>{{ apiKey.lastUsedAt ? (apiKey.lastUsedAt | date: 'short') : 'Nunca' }}</td>
						<td class="text-end">
							@if (apiKey.active) {
								<button type="button" class="btn btn-dark btn-sm rounded-circle" title="Revocar" (click)="revokeApiKey(apiKey)"><i class="bi bi-x-lg"></i></button>
							}
						</td>
					</tr>
				} @empty {
					<tr>
						<td colspan="6" class="text-body-secondary text-center py-4">Todavía no generaste ninguna API key.</td>
					</tr>
				}
			</tbody>
		</table>

		@if (createdKey(); as created) {
			<div class="modal fade" id="createdApiKeyModal" tabindex="-1" aria-labelledby="createdApiKeyModalLabel" aria-hidden="true" data-bs-backdrop="static">
				<div class="modal-dialog">
					<div class="modal-content">
						<div class="modal-header">
							<h1 class="modal-title fs-5" id="createdApiKeyModalLabel">"{{ created.name }}" generada</h1>
						</div>
						<div class="modal-body">
							<div class="alert alert-warning small">
								<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
								Guarda esta clave ahora — por seguridad no se vuelve a mostrar, ni siquiera acá.
							</div>
							<div class="input-group">
								<input type="text" class="form-control font-monospace" readonly [value]="created.key" />
								<button type="button" class="btn btn-outline-secondary" (click)="copy(created.key, 'newKey')">
									<i class="bi" [class.bi-clipboard]="copied() !== 'newKey'" [class.bi-clipboard-check]="copied() === 'newKey'" aria-hidden="true"></i>
									{{ copied() === 'newKey' ? 'Copiada' : 'Copiar' }}
								</button>
							</div>
						</div>
						<div class="modal-footer">
							<button type="button" class="btn btn-danger" (click)="closeCreatedKeyModal()">Ya la guardé</button>
						</div>
					</div>
				</div>
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiKeysComponent implements AfterViewInit {
	private readonly apiKeysService = inject(ApiKeysService);

	apiBaseUrl = `${window.location.origin}/api/v1`;
	apiKeys = signal<ApiKey[]>([]);
	creating = signal(false);
	createError = signal('');
	createdKey = signal<CreatedApiKey | null>(null);
	copied = signal<'baseUrl' | 'newKey' | null>(null);
	private createdKeyModal: any;

	ngAfterViewInit(): void {
		this.loadApiKeys();
	}

	loadApiKeys() {
		this.apiKeysService.getApiKeys().subscribe((apiKeys) => this.apiKeys.set(apiKeys));
	}

	createApiKey(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;

		this.creating.set(true);
		this.createError.set('');
		this.apiKeysService.createApiKey(trimmed).subscribe({
			next: (created) => {
				this.creating.set(false);
				this.createdKey.set(created);
				this.loadApiKeys();
				// El modal recién existe en el DOM una vez que @if (createdKey(); ...) renderiza — se crea la
				// instancia acá, no en ngAfterViewInit (donde todavía no hay nada que mostrar).
				queueMicrotask(() => {
					this.createdKeyModal = bootstrap.Modal.getOrCreateInstance('#createdApiKeyModal', { backdrop: 'static' });
					this.createdKeyModal.show();
				});
			},
			error: (err: HttpErrorResponse) => {
				this.creating.set(false);
				this.createError.set(extractErrorMessage(err));
			},
		});
	}

	closeCreatedKeyModal() {
		this.createdKeyModal?.hide();
		this.createdKey.set(null);
	}

	revokeApiKey(apiKey: ApiKey) {
		confirm(`¿Revocar la API key "${apiKey.name}"? Cualquier integración que la use dejará de funcionar de inmediato.`, {
			onConfirm: () =>
				this.apiKeysService.revokeApiKey(apiKey.id).subscribe({
					next: () => this.loadApiKeys(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				}),
		});
	}

	copy(text: string, which: 'baseUrl' | 'newKey') {
		navigator.clipboard.writeText(text).then(() => {
			this.copied.set(which);
			setTimeout(() => this.copied.set(null), 2000);
		});
	}
}
