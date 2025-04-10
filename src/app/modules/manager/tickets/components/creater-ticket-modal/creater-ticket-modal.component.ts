import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-creater-ticket-modal',
	imports: [],
	template: `
	<div class="modal fade" id="createTicketModal" tabindex="-1" aria-labelledby="createTicketModalLabel" aria-hidden="true">
		<div class="modal-dialog">
			<div class="modal-content">
				<div class="modal-header">
					<h1 class="modal-title fs-5" id="createTicketModalLabel">Create ticket</h1>
					<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
				</div>
				<div class="modal-body">
					<form class="needs-validation" novalidate="">
            	<div class="row">
                <div class="col-md-6 mb-3">
                  <label for="name">Name </label>
                  <input type="text" class="form-control" />
                </div>
                <div class="col-md-6 mb-3">
                  <label for="code">Code </label>
                  <input type="text" class="form-control" />
                </div>
              </div>
						<div class="mb-3">
							<label for="description">Description </label>
							<input type="text" class="form-control" />
						</div>
						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="firstName">Count</label>
								<input type="text" class="form-control" id="firstName" placeholder="" value="" required="" />
								<div class="invalid-feedback">Valid first name is required.</div>
							</div>
							<div class="col-md-6 mb-3">
								<label for="lastName">Price</label>
								<input type="text" class="form-control" id="lastName" placeholder="" value="" required="" />
								<div class="invalid-feedback">Valid last name is required.</div>
							</div>
						</div>

						<div class="row">
							<div class="col-md-6 mb-3">
								<label for="type">Type</label>
								<select class="custom-select d-block w-100" required="">
									<option value="">Choose...</option>
									<option>VIP</option>
									<option>NORMAL</option>
								</select>
								<!-- <div class="invalid-feedback">Please select a valid country.</div> -->
							</div>
							<div class="col-md-6 mb-3">
								<label for="state">Statu</label>
								<select class="custom-select d-block w-100" id="state" required="">
									<option value="">Choose...</option>
									<option>Active</option>
									<option>Inactive</option>
								</select>
								<!-- <div class="invalid-feedback">Please provide a valid state.</div> -->
							</div>
						</div>
					</form>
				</div>
				<div class="modal-footer">
					<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
					<button type="button" class="btn btn-danger">Create</button>
				</div>
			</div>
		</div>
	</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreaterTicketModalComponent {}
