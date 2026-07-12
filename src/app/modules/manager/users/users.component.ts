import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import * as bootstrap from "bootstrap";

import { ExportUsersModalComponent } from './components/export-users-modal/export-users-modal.component';
import { ImportUsersModalComponent } from './components/import-users-modal/import-users-modal.component';
import { UpdateUserModalComponent } from "./components/update-user-modal/update-user-modal.component";


import { User } from '../../../models/users/user';
import { UserService } from './services/user.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';

type SortKey = 'carnet' | 'name' | 'lastname' | 'username' | 'email' | 'phone' | 'type';

@Component({
	selector: 'app-users',
	imports: [UpdateUserModalComponent, ImportUsersModalComponent, ExportUsersModalComponent],
	template: `
		<h2 class="section-title">Users Manager</h2>
		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search">
					<button type="button" class="btn btn-primary me-4" (click)="openUpdateUserModal(null)">Create</button>
					<input class="form-control me-2" type="search" placeholder="Search" aria-label="Name" />
					<button class="btn btn-dark me-4" type="submit"> Search</button>
					<button class="btn btn-danger" type="button" ><i class="bi bi-eraser-fill"></i></button>
				</form>
				<div class="navbar-brand">
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
					<th scope="col" role="button" (click)="toggleSort('carnet')">Carnet <i class="bi" [class]="sortIcon('carnet')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('name')">Name <i class="bi" [class]="sortIcon('name')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('lastname')">LastName <i class="bi" [class]="sortIcon('lastname')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('username')">UserName <i class="bi" [class]="sortIcon('username')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('email')">Email <i class="bi" [class]="sortIcon('email')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('phone')">Phone <i class="bi" [class]="sortIcon('phone')"></i></th>
					<th scope="col" role="button" (click)="toggleSort('type')">Type <i class="bi" [class]="sortIcon('type')"></i></th>
					<th scope="col"></th>
				</tr>
			</thead>
			<tbody>
				@for (user of sortedUsers(); track user.id) {
					<tr>
						<td scope="row">
							<input class="form-check-input" type="checkbox" id="check_{{ $index }}" />
						</td>
						<td>{{ user.carnet }}</td>
						<td>{{ user.name }}</td>
						<td>{{ user.lastname }}</td>
						<td>{{ user.username }}</td>
						<td>{{ user.email }}</td>
						<td>{{ user.phone }}</td>
						<td>{{ user.type.name }}</td>
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

	sortedUsers = computed(() => {
		const key = this.sortKey();
		const list = [...this.users()];
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
