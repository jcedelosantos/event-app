import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';

import { CreateUserModalComponent } from "./components/create-user-modal/create-user-modal.component";
import { UpdateUserModalComponent } from "./components/update-user-modal/update-user-modal.component";
import { DeletUserModalComponent } from './components/delet-user-modal/delet-user-modal.component';
import { ImportUsersModalComponent } from './components/import-users-modal/import-users-modal.component';
import { ExportUsersModalComponent } from './components/export-users-modal/export-users-modal.component';

import { users } from '../../../data/users';
import { User } from '../../../models/users/user';
@Component({
	selector: 'app-users',
	imports: [CreateUserModalComponent, UpdateUserModalComponent, DeletUserModalComponent, ImportUsersModalComponent, ExportUsersModalComponent],
	template: `
		<br />
		<br />
		<h2>Users Manager</h2>
		<br />
		<nav class="navbar border-bottom border-body">
			<div class="container-fluid">
				<form class="d-flex" role="search">
					<button type="button" class="btn btn-danger  me-4" data-bs-toggle="modal" data-bs-target="#createUserModal">Create</button>
					<input class="form-control me-2" type="search" placeholder="Search" aria-label="Name" />
					<button class="btn btn-dark me-4" type="submit">Search</button>
					<button class="btn btn-danger" type="button" data-bs-toggle="modal" data-bs-target="#deletUserModal"><i class="bi bi-trash-fill"></i></button>
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
						{{ users?.length }}
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
						<input type="radio" class="btn-check" name="options-base" id="optionName" autocomplete="off" checked />
						<label class="btn" for="optionName">Name</label>
					</th>

					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionLastName" autocomplete="off" />
						<label class="btn" for="optionLastName">LastName</label>
					</th>
					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionCarnet" autocomplete="off" />
						<label class="btn" for="optionCarnet">Carnet</label>
					</th>
					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionUserName" autocomplete="off" />
						<label class="btn" for="optionUserName">UserName</label>
					</th>
					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionEmail" autocomplete="off" />
						<label class="btn" for="optionEmail">Email</label>
					</th>
					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionPhone" autocomplete="off" />
						<label class="btn" for="optionPhone">Phone</label>
					</th>
					<th scope="col">
						<input type="radio" class="btn-check" name="options-base" id="optionType" autocomplete="off" />
						<label class="btn" for="optionType">Type</label>
					</th>
				</tr>
			</thead>
			<tbody>
				@for (user of users; track $index) {
					<tr>
						<td scope="row">
							<input class="form-check-input" type="checkbox" id="check_{{ $index }}" />
						</td>
						<td>{{ user.name }}</td>
						<td>{{ user.lastname }}</td>
						<td>{{ user.carnet }}</td>
						<td>{{ user.username }}</td>
						<td>{{ user.email }}</td>
						<td>{{ user.phone }}</td>
						<td>
							<div class="row">
								<div class="col">{{ user.type.name }}</div>
								<div class="col">
									<div class="d-flex flex-row-reverse">
										<button type="button" class="btn btn-dark btn-sm rounded-circle" data-bs-toggle="modal" data-bs-target="#deletUserModal"><i class="bi bi-x-lg"></i></button>
										<button type="button" class="btn btn-dark btn-sm rounded-circle me-2" data-bs-toggle="modal" data-bs-target="#updateUserModal"><i class="bi bi-pencil"></i></button>
									</div>
								</div>
							</div>
						</td>
					</tr>
				}
			</tbody>
		</table>
		<app-create-user-modal />
		<app-update-user-modal />
		<app-delet-user-modal />
		<app-import-users-modal />
		<app-export-users-modal />
	`,
	styleUrl: './users.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit {
	users: Array<User> | undefined;

	ngOnInit(): void {
		this.users = users;
	}
}
