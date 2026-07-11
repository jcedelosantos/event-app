import { AfterViewInit, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import * as bootstrap from "bootstrap";

import { ExportUsersModalComponent } from './components/export-users-modal/export-users-modal.component';
import { ImportUsersModalComponent } from './components/import-users-modal/import-users-modal.component';
import { UpdateUserModalComponent } from "./components/update-user-modal/update-user-modal.component";


import { User } from '../../../models/users/user';
import { UserService } from './services/user.service';
import { confirm, error } from '../../../utils/messages';
import { extractErrorMessage } from '../../../utils/api-error';
import { HttpErrorResponse } from '@angular/common/http';
@Component({
	selector: 'app-users',
	imports: [UpdateUserModalComponent, ImportUsersModalComponent, ExportUsersModalComponent],
	template: `
		<br />
		<br />
		<h2>Users Manager</h2>
		<br />
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

		<table class="table table-hover ">
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
					<th scope="col"><input class="form-check-input mb-2" type="checkbox" id="checkAll" /></th>
					<th scope="col">
						Name
					</th>
					<th scope="col">
						LastName
					</th>
					<th scope="col">
						Carnet
					</th>
					<th scope="col">
						UserName
					</th>
					<th scope="col">
						Email
					</th>
					<th scope="col">
						Phone
					</th>
					<th scope="col">
						Type
					</th>
				</tr>
			</thead>
			<tbody>
				@for (user of users(); track $index) {
					<tr>
						<td scope="row">
							<input class="form-check-input" type="checkbox" id="check_{{ $index }}" />
						</td>
						<td class="ml-2">{{ user.name }}</td>
						<td class="ml-2">{{ user.lastname }}</td>
						<td class="ml-2">{{ user.carnet }}</td>
						<td class="ml-2">{{ user.username }}</td>
						<td class="ml-2">{{ user.email }}</td>
						<td class="ml-2">{{ user.phone }}</td>
						<td>
							<div class="row">
								<div class="col">{{ user.type.name }}</div>
								<div class="col">
									<div class="d-flex flex-row-reverse">
										<button type="button" class="btn btn-dark btn-sm rounded-circle" (click)="deleteUser(user)"><i class="bi bi-x-lg"></i></button>
										<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" (click)="openUpdateUserModal(user)"><i class="bi bi-pencil"></i></button>
									</div>
								</div>
							</div>
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
