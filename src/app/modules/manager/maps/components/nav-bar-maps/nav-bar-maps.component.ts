import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-nav-bar-maps',
	imports: [],
	template: `
		<div class="container-fluid text-center m-3">
			<div class="row">
				<div class="col-8">
					<nav class="navbar">
						<div class="container-fluid">
							<form class="d-flex" role="search">
								<button type="button" class="me-4 btn btn-danger">Create </button>
								<input class="form-control me-3" type="search" placeholder="Name" aria-label="Search" />
								<input class="form-control me-3" type="search" placeholder="Location" aria-label="Search" />
								<button class="btn btn-outline-danger" type="button">Search</button>
							</form>
						</div>
					</nav>
				</div>
				<div class="col-4">
					<div class="d-flex justify-content-end">
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
			</div>
		</div>
	`,
	styleUrl: './nav-bar-maps.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarMapsComponent {}
