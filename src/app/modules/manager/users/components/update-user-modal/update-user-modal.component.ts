import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-update-user-modal',
	imports: [],
	template: `
		<!-- Modal -->
		<div class="modal fade" id="updateUserModal" tabindex="-1" aria-labelledby="updateUserModalLabel" aria-hidden="true">
			<div class="modal-dialog">
				<div class="modal-content">
					<div class="modal-header">
						<h1 class="modal-title fs-5" id="updateUserModalLabel">Update user</h1>
						<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
					</div>
					<div class="modal-body">
						<form class="needs-validation" novalidate="">
							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="firstName">First name</label>
									<input type="text" class="form-control" id="firstName" placeholder="" value="" required="" />
									<div class="invalid-feedback">Valid first name is required.</div>
								</div>
								<div class="col-md-6 mb-3">
									<label for="lastName">Last name</label>
									<input type="text" class="form-control" id="lastName" placeholder="" value="" required="" />
									<div class="invalid-feedback">Valid last name is required.</div>
								</div>
							</div>

							<div class="mb-3">
								<label for="pasword">Password</label>
								<input type="password" class="form-control" required="" />
								<!-- <div class="invalid-feedback">Please enter your shipping address.</div> -->
							</div>

							<div class="mb-3">
								<label for="pasword2">Password <span class="text-muted">(Confirm)</span></label>
								<input type="password" class="form-control" />
							</div>

							<div class="mb-3">
								<label for="email">Email <span class="text-muted">(Optional)</span></label>
								<input type="email" class="form-control" id="email" placeholder="you@example.com" />
								<div class="invalid-feedback">Please enter a valid email address for shipping updates.</div>
							</div>

							<div class="mb-3">
								<label for="address">Adress <span class="text-muted">(Optional)</span></label>
								<input type="text" class="form-control" placeholder="Apartment or suite" />
							</div>

							<div class="row">
								<div class="col-md-6 mb-3">
									<label for="type">Type</label>
									<select class="custom-select d-block w-100" required="">
										<option value="">Choose...</option>
										<option>Admin</option>
										<option>User</option>
										<option>Client</option>
									</select>
									<!-- <div class="invalid-feedback">Please select a valid country.</div> -->
								</div>
								<div class="col-md-6 mb-3">
									<label for="state">Gender</label>
									<select class="custom-select d-block w-100" id="state" required="">
										<option value="">Choose...</option>
										<option>Man</option>
										<option>Woman</option>
									</select>
									<!-- <div class="invalid-feedback">Please provide a valid state.</div> -->
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Carnet</label>
									<input type="text" class="form-control" placeholder="" required="" />
									<!-- <div class="invalid-feedback">Zip code required.</div> -->
								</div>
								<div class="col-md-6 mb-3">
									<label for="zip">Phone <span class="text-muted">(Optional)</span></label>
									<input type="text" class="form-control" placeholder="" required="" />
									<!-- <div class="invalid-feedback">Zip code required.</div> -->
								</div>
							</div>
						</form>
					</div>
					<div class="modal-footer">
						<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
						<button type="button" class="btn btn-danger">Update</button>
					</div>
				</div>
			</div>
		</div>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateUserModalComponent {}
