import { AfterViewInit, ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import * as bootstrap from "bootstrap";

import { ExportUsersModalComponent } from './components/export-users-modal/export-users-modal.component';
import { ImportUsersModalComponent } from './components/import-users-modal/import-users-modal.component';
import { UpdateUserModalComponent } from "./components/update-user-modal/update-user-modal.component";


import { User } from '../../../models/users/user';
import { UserService } from './services/user.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

type SortKey = 'carnet' | 'name' | 'lastname' | 'username' | 'email' | 'type';
type ColumnKey = SortKey;

const COLUMN_LABELS: Record<ColumnKey, string> = {
	carnet: 'Carnet',
	name: 'Name',
	lastname: 'LastName',
	username: 'UserName',
	email: 'Email',
	type: 'Type',
};

@Component({
	selector: 'app-users',
	imports: [UpdateUserModalComponent, ImportUsersModalComponent, ExportUsersModalComponent],
	template: `
		<h2 class="section-title">Users Manager</h2>
		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search" (submit)="$event.preventDefault(); searchText.set(searchInput.value)">
					<button type="button" class="btn btn-primary me-4" (click)="openUpdateUserModal(null)">Create</button>
					<input #searchInput class="form-control me-2" type="search" placeholder="Search" aria-label="Name" (input)="searchText.set(searchInput.value)" />
					<button class="btn btn-dark me-4" type="submit"> Search</button>
					<button class="btn btn-danger" type="button" (click)="searchInput.value = ''; searchText.set('')"><i class="bi bi-eraser-fill"></i></button>
				</form>
				<div class="navbar-brand d-flex align-items-center gap-3">
					<div class="dropdown" (click)="$event.stopPropagation()">
						<button class="btn btn-outline-secondary btn-sm" type="button" (click)="columnsMenuOpen.set(!columnsMenuOpen())">
							<i class="bi bi-layout-three-columns"></i> Columnas
						</button>
						<ul class="dropdown-menu p-2" [class.show]="columnsMenuOpen()">
							@for (col of columns; track col.key) {
								<li class="form-check px-2">
									<input
										class="form-check-input"
										type="checkbox"
										id="col_{{ col.key }}"
										[checked]="visibleColumns()[col.key]"
										(change)="toggleColumn(col.key)"
									/>
									<label class="form-check-label" for="col_{{ col.key }}">{{ col.label }}</label>
								</li>
							}
						</ul>
					</div>
					<div class="row">
						<div class="col">
							<i class="bi bi-arrow-up-circle-fill" data-bs-toggle="modal" data-bs-target="#importUsersModal"></i>
						</div>
						<div class="col">
							<i class="bi bi-arrow-down-circle-fill" data-bs-toggle="modal" data-bs-target="#exportUsersModal"></i>
						</div>
					</div>
				</div>
			</div>
		</nav>
		<br />

		<table class="table table-hover table-sm align-middle users-table">
			<caption>
				<div class="d-flex justify-content-between">
					<div class="p-2">
						List of users
						{{ users().length }}
						/ 10
					</div>
					<div class="p-2">
						<nav aria-label="Page navigation example">
							<ul class="pagination">
								<li class="page-item">
									<a class="page-link" aria-label="Previous">
										<span aria-hidden="true">&laquo;</span>
									</a>
								</li>
								<li class="page-item"><a class="page-link">1</a></li>
								<li class="page-item"><a class="page-link">2</a></li>
								<li class="page-item"><a class="page-link">3</a></li>
								<li class="page-item">
									<a class="page-link" aria-label="Next">
										<span aria-hidden="true">&raquo;</span>
									</a>
								</li>
							</ul>
						</nav>
					</div>
				</div>
			</caption>
			<thead>
				<tr>
					<th scope="col"><input class="form-check-input" type="checkbox" id="checkAll" /></th>
					@if (visibleColumns()['carnet']) {
						<th scope="col" role="button" (click)="toggleSort('carnet')">Carnet <i class="bi" [class]="sortIcon('carnet')"></i></th>
					}
					@if (visibleColumns()['name']) {
						<th scope="col" role="button" (click)="toggleSort('name')">Name <i class="bi" [class]="sortIcon('name')"></i></th>
					}
					@if (visibleColumns()['lastname']) {
						<th scope="col" role="button" (click)="toggleSort('lastname')">LastName <i class="bi" [class]="sortIcon('lastname')"></i></th>
					}
					@if (visibleColumns()['username']) {
						<th scope="col" role="button" (click)="toggleSort('username')">UserName <i class="bi" [class]="sortIcon('username')"></i></th>
					}
					@if (visibleColumns()['email']) {
						<th scope="col" role="button" (click)="toggleSort('email')">Email <i class="bi" [class]="sortIcon('email')"></i></th>
					}
					@if (visibleColumns()['type']) {
						<th scope="col" role="button" (click)="toggleSort('type')">Type <i class="bi" [class]="sortIcon('type')"></i></th>
					}
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				@for (user of sortedUsers(); track user.id) {
					<tr>
						<td scope="row">
							<input class="form-check-input" type="checkbox" id="check_{{ $index }}" />
						</td>
						@if (visibleColumns()['carnet']) {
							<td>{{ user.carnet }}</td>
						}
						@if (visibleColumns()['name']) {
							<td>{{ user.name }}</td>
						}
						@if (visibleColumns()['lastname']) {
							<td>{{ user.lastname }}</td>
						}
						@if (visibleColumns()['username']) {
							<td>{{ user.username }}</td>
						}
						@if (visibleColumns()['email']) {
							<td>{{ user.email }}</td>
						}
						@if (visibleColumns()['type']) {
							<td>{{ user.type.name }}</td>
						}
						<td class="text-end text-nowrap">
							<button type="button" class="btn btn-dark btn-sm rounded-circle me-1" (click)="openUpdateUserModal(user)"><i class="bi bi-pencil"></i></button>
							<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteUser(user)"><i class="bi bi-x-lg"></i></button>
						</td>
					</tr>
				}
			</tbody>
		</table>
		<!-- <app-create-user-modal /> -->
		<app-update-user-modal [user]="selectedUser()" (userSaved)="loadUsers()" />
		<!-- <app-delet-user-modal /> -->
		<app-import-users-modal />
		<app-export-users-modal />
	`,
	styleUrl: './users.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements AfterViewInit {
	userService = inject(UserService);
	users = signal<User[]>([]);
	selectedUser = signal<User | null>(null);
	userUpdateModal: any;

	sortKey = signal<SortKey | null>(null);
	sortDir = signal<'asc' | 'desc'>('asc');
	searchText = signal('');

	columns = (Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => ({ key, label: COLUMN_LABELS[key] }));

	// LastName arranca oculto: las importaciones masivas mandan todo el nombre completo en el campo
	// Name y dejan LastName vacío, así que mostrar la columna solo agrega ruido por defecto.
	visibleColumns = signal<Record<ColumnKey, boolean>>({
		carnet: true,
		name: true,
		lastname: false,
		username: true,
		email: true,
		type: true,
	});

	toggleColumn(key: ColumnKey) {
		this.visibleColumns.update((cols) => ({ ...cols, [key]: !cols[key] }));
	}

	// Ver el mismo fix y comentario en qrs.component.ts: el data-API de dropdown de Bootstrap no
	// abría el menú de forma confiable, así que se maneja con un signal en vez de su ciclo de vida JS.
	columnsMenuOpen = signal(false);

	@HostListener('document:click')
	closeColumnsMenu() {
		this.columnsMenuOpen.set(false);
	}

	filteredUsers = computed(() => {
		const term = this.searchText().trim().toLowerCase();
		if (!term) return this.users();
		return this.users().filter((u) =>
			[u.carnet, u.name, u.lastname, u.username, u.email, u.type?.name].some((field) => field?.toLowerCase().includes(term)),
		);
	});

	sortedUsers = computed(() => {
		const key = this.sortKey();
		const list = [...this.filteredUsers()];
		if (!key) return list;
		const dir = this.sortDir() === 'asc' ? 1 : -1;
		return list.sort((a, b) => {
			const av = key === 'type' ? a.type.name : a[key];
			const bv = key === 'type' ? b.type.name : b[key];
			return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
		});
	});

	ngAfterViewInit(): void {
		this.userUpdateModal = new bootstrap.Modal("#updateUserModal", { backdrop: true });
		this.loadUsers();
	}

	loadUsers() {
		this.userService.getUsers().subscribe((users) => this.users.set(users));
	}

	openUpdateUserModal(user: User | null) {
		this.selectedUser.set(user);
		this.userUpdateModal?.show();
	}

	toggleSort(key: SortKey) {
		if (this.sortKey() === key) {
			this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
		} else {
			this.sortKey.set(key);
			this.sortDir.set('asc');
		}
	}

	sortIcon(key: SortKey): string {
		if (this.sortKey() !== key) return 'bi-arrow-down-up text-muted small';
		return this.sortDir() === 'asc' ? 'bi-sort-alpha-down' : 'bi-sort-alpha-up';
	}

	deleteUser(user: User) {
		confirm(`¿Eliminar al usuario ${user.username}?`, {
			onConfirm: () =>
				this.userService.deleteUser(user.id).subscribe({
					next: () => this.loadUsers(),
					error: (err: HttpErrorResponse) => error(extractErrorMessage(err)),
				}),
		});
	}
}
