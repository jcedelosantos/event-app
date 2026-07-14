import { AfterViewInit, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { TenantService } from './services/tenant.service';
import { CreateTenantModalComponent } from './components/create-tenant-modal/create-tenant-modal.component';
import { EditTenantModalComponent } from './components/edit-tenant-modal/edit-tenant-modal.component';
import { AccountModalComponent } from '../../shared/account-modal/account-modal.component';
import { Tenant } from '../../models/tenants/tenant';
import { AuthService } from '../../core/services/auth.service';
import { confirm, error } from '../../utils/messages';
import { extractErrorMessage } from '../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
	selector: 'app-super-admin',
	imports: [CreateTenantModalComponent, EditTenantModalComponent, AccountModalComponent, DatePipe],
	template: `
		<div class="container-fluid py-4" data-bs-theme="dark">
			<div class="d-flex justify-content-between align-items-center mb-4">
				<div>
					<h2 class="section-title mb-0">Organizaciones</h2>
					<p class="text-muted small mb-0">Panel de Super Admin — alta de clubes/iglesias que usan la plataforma.</p>
				</div>
				<div class="d-flex gap-2">
					<button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createTenantModal">
						<i class="bi bi-plus-lg"></i> Nueva organización
					</button>
					<button type="button" class="btn btn-outline-secondary" data-bs-toggle="modal" data-bs-target="#accountModal">
						<i class="bi bi-person-circle"></i> Mi cuenta
					</button>
					<button type="button" class="btn btn-outline-secondary" (click)="logout()"><i class="bi bi-box-arrow-left"></i> Salir</button>
				</div>
			</div>

			<table class="table table-hover align-middle">
				<thead>
					<tr>
						<th scope="col">Organización</th>
						<th scope="col">Slug</th>
						<th scope="col">Usuarios</th>
						<th scope="col">Eventos</th>
						<th scope="col">Creada</th>
						<th scope="col">Estado</th>
						<th scope="col"></th>
					</tr>
				</thead>
				<tbody>
					@for (tenant of tenants(); track tenant.id) {
						<tr>
							<td>{{ tenant.name }}</td>
							<td class="text-muted">{{ tenant.slug }}</td>
							<td>{{ tenant._count?.users ?? 0 }}</td>
							<td>{{ tenant._count?.events ?? 0 }}</td>
							<td class="text-muted">{{ tenant.createdAt | date: 'mediumDate' }}</td>
							<td>
								<span class="badge" [class.text-bg-success]="tenant.active" [class.text-bg-secondary]="!tenant.active">
									{{ tenant.active ? 'Activa' : 'Inactiva' }}
								</span>
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
								<button type="button" class="btn btn-sm" [class.btn-outline-danger]="tenant.active" [class.btn-outline-success]="!tenant.active" (click)="toggleActive(tenant)">
									{{ tenant.active ? 'Desactivar' : 'Activar' }}
								</button>
							</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="7" class="text-center text-muted py-4">Todavía no hay organizaciones creadas.</td>
						</tr>
					}
				</tbody>
			</table>
		</div>
		<app-create-tenant-modal (tenantCreated)="loadTenants()" />
		<app-edit-tenant-modal [(tenant)]="selectedTenant" (tenantUpdated)="loadTenants()" />
		<app-account-modal />
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminComponent implements AfterViewInit {
	private readonly tenantService = inject(TenantService);
	private readonly authService = inject(AuthService);
	private readonly router = inject(Router);

	tenants = signal<Tenant[]>([]);
	selectedTenant = signal<Tenant | null>(null);

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
