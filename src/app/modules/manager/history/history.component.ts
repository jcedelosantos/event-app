import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLog } from '../../../models/audit/audit-log';
import { AuditLogService } from './services/audit-log.service';

const ENTITY_LABELS: Record<string, string> = {
	Event: 'Evento',
	Product: 'Producto',
	User: 'Usuario',
	SaleTicket: 'Venta de ticket',
	SaleProduct: 'Venta de producto',
};

@Component({
	selector: 'app-history',
	imports: [DatePipe, FormsModule],
	template: `
		<h2 class="section-title">Auditoría</h2>
		<p class="text-body-secondary small">
			Registro de altas, ediciones y borrados de eventos, productos, usuarios y ventas.
			@if (totalCount(); as total) {
				Mostrando los {{ logs().length }} movimientos más recientes de {{ total }} en total.
			} @else {
				Se guardan los últimos 300 movimientos.
			}
		</p>

		<div class="row my-3">
			<div class="col-sm-4">
				<label class="form-label small text-body-secondary mb-1">Entidad</label>
				<select class="form-select form-select-sm" [ngModel]="entityFilter()" (ngModelChange)="onEntityFilterChange($event)">
					<option [ngValue]="null">Todas</option>
					@for (entity of entities; track entity) {
						<option [ngValue]="entity">{{ entityLabel(entity) }}</option>
					}
				</select>
			</div>
			<div class="col-sm-4">
				<label class="form-label small text-body-secondary mb-1">Buscar</label>
				<input type="search" class="form-control form-control-sm" placeholder="Usuario o detalle..." [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" />
			</div>
		</div>

		@if (loading()) {
			<p class="text-body-secondary">Cargando...</p>
		} @else {
			<table class="table table-striped table-hover table-sm history-table">
				<thead>
					<tr>
						<th>Fecha</th>
						<th>Usuario</th>
						<th>Acción</th>
						<th>Entidad</th>
						<th>Detalle</th>
					</tr>
				</thead>
				<tbody>
					@for (log of pagedLogs(); track log.id) {
						<tr>
							<td class="text-nowrap">{{ log.createdAt | date: 'short' }}</td>
							<td class="col-user">{{ log.user ? log.user.name + ' ' + log.user.lastname : 'Usuario borrado' }}</td>
							<td>
								<span class="badge" [class]="actionBadgeClass(log.action)">{{ actionLabel(log.action) }}</span>
							</td>
							<td>{{ entityLabel(log.entity) }}</td>
							<td>{{ log.summary }}</td>
						</tr>
					} @empty {
						<tr>
							<td colspan="5" class="text-muted">Todavía no hay movimientos registrados.</td>
						</tr>
					}
				</tbody>
			</table>

			@if (totalPages() > 1) {
				<div class="d-flex justify-content-between align-items-center mt-2">
					<span class="small text-body-secondary">Página {{ currentPage() }} de {{ totalPages() }}</span>
					<div class="btn-group btn-group-sm">
						<button type="button" class="btn btn-outline-light" [disabled]="currentPage() === 1" (click)="currentPage.set(currentPage() - 1)">
							<i class="bi bi-chevron-left"></i> Anterior
						</button>
						<button type="button" class="btn btn-outline-light" [disabled]="currentPage() === totalPages()" (click)="currentPage.set(currentPage() + 1)">
							Siguiente <i class="bi bi-chevron-right"></i>
						</button>
					</div>
				</div>
			}
		}
	`,
	styleUrl: './history.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent implements OnInit {
	private readonly auditLogService = inject(AuditLogService);

	entities = Object.keys(ENTITY_LABELS);

	logs = signal<AuditLog[]>([]);
	loading = signal(true);
	entityFilter = signal<string | null>(null);
	searchText = signal('');
	// null salvo que la respuesta esté realmente truncada (total > lo devuelto) — con un filtro de
	// entidad activo el total ya casi nunca supera el límite de 300, así que el aviso desaparece solo.
	totalCount = signal<number | null>(null);

	filteredLogs = computed(() => {
		const q = this.searchText().trim().toLowerCase();
		if (!q) return this.logs();
		return this.logs().filter((log) => {
			const userName = log.user ? `${log.user.name} ${log.user.lastname}`.toLowerCase() : '';
			return userName.includes(q) || log.summary.toLowerCase().includes(q);
		});
	});

	// Paginación en el cliente — los hasta 300 registros ya vienen en una sola respuesta (ver
	// loadLogs), así que no hace falta ir y volver al servidor por cada página. 20 filas es lo que
	// entra sin scroll en la mayoría de las pantallas con una fila por movimiento (ver fix de
	// col-user más abajo, que evita que "Super Admin" parta en dos líneas).
	readonly pageSize = 20;
	currentPage = signal(1);
	totalPages = computed(() => Math.max(1, Math.ceil(this.filteredLogs().length / this.pageSize)));
	pagedLogs = computed(() => {
		const page = Math.min(this.currentPage(), this.totalPages());
		return this.filteredLogs().slice((page - 1) * this.pageSize, page * this.pageSize);
	});

	ngOnInit(): void {
		this.loadLogs();
	}

	onEntityFilterChange(entity: string | null) {
		this.entityFilter.set(entity);
		this.currentPage.set(1);
		this.loadLogs();
	}

	loadLogs() {
		this.loading.set(true);
		this.auditLogService.getAuditLogs(this.entityFilter() ?? undefined).subscribe(({ items, totalCount }) => {
			this.logs.set(items);
			this.totalCount.set(totalCount != null && totalCount > items.length ? totalCount : null);
			this.currentPage.set(1);
			this.loading.set(false);
		});
	}

	entityLabel(entity: string): string {
		return ENTITY_LABELS[entity] ?? entity;
	}

	actionLabel(action: AuditLog['action']): string {
		return action === 'CREATE' ? 'Creó' : action === 'UPDATE' ? 'Editó' : 'Borró';
	}

	actionBadgeClass(action: AuditLog['action']): string {
		if (action === 'CREATE') return 'text-bg-success';
		if (action === 'UPDATE') return 'text-bg-warning';
		return 'text-bg-danger';
	}
}
