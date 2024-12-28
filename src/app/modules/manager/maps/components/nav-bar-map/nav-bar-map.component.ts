import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Map } from '../../../../../models/maps/map';

@Component({
	selector: 'nav-bar-map',
	imports: [RouterLink],
	template: `
		<div class="row nav-bar">
			<div class="col-6 p-2">
				<button type="button" class="btn btn-dark m-1" routerLink="/manager/maps"><i class="bi bi-skip-backward-fill"></i> Back</button>
				<button type="button" class="btn btn-dark m-1" routerLink="/manager/maps">Map</button>
			</div>

			<div class="col-6 d-flex flex-row-reverse p-2">
				<nav aria-label="Page navigation example">
					<ul class="pagination justify-content-center">
						<li class="page-item disabled">
							<a class="page-link" tabindex="-1">Previous</a>
						</li>
						@for (map of maps; track $index; let idx = $index) {
							<li class="page-item">
								<a class="page-link" routerLink="/manager/maps/{{ map.id }}">{{ idx + 1 }}</a>
							</li>
						}
						<li class="page-item">
							<a class="page-link">Next</a>
						</li>
					</ul>
				</nav>
			</div>
		</div>
	`,
	styleUrl: './nav-bar-map.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarMapComponent implements OnInit {
	@Input()
	maps: Array<Map> | undefined;

	constructor() {}

	ngOnInit(): void {}
}
