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
			Registro de altas, ediciones y borrados de eventos, productos, usuarios y ventas. Se guardan los últimos 300 movimientos.
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
					@for (log of filteredLogs(); track log.id) {
						<tr>
							<td class="text-nowrap">{{ log.createdAt | date: 'short' }}</td>
							<td>{{ log.user ? log.user.name + ' ' + log.user.lastname : 'Usuario borrado' }}</td>
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

	filteredLogs = computed(() => {
		const q = this.searchText().trim().toLowerCase();
		if (!q) return this.logs();
		return this.logs().filter((log) => {
			const userName = log.user ? `${log.user.name} ${log.user.lastname}`.toLowerCase() : '';
			return userName.includes(q) || log.summary.toLowerCase().includes(q);
		});
	});

	ngOnInit(): void {
		this.loadLogs();
	}

	onEntityFilterChange(entity: string | null) {
		this.entityFilter.set(entity);
		this.loadLogs();
	}

	loadLogs() {
		this.loading.set(true);
		this.auditLogService.getAuditLogs(this.entityFilter() ?? undefined).subscribe((logs) => {
			this.logs.set(logs);
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
