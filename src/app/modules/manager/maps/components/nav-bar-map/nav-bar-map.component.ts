import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Map } from '../../../../../models/maps/map';
import { Area } from '../../../../../models/maps/area';

@Component({
	selector: 'nav-bar-map',
	imports: [RouterLink],
	template: `
		<div class="row nav-bar">
			<div class="col-6 p-2">
				<button type="button" class="btn btn-dark m-1" routerLink="/manager/maps">Maps</button>
				@if (idMap) {
					<button type="button" class="btn btn-dark m-1" [routerLink]="'/manager/maps/' + idMap + '/areas'">Areas</button>
				}
			</div>

			<div class="col-6 d-flex flex-row-reverse p-2">
				<nav aria-label="Page navigation example">
					<ul class="pagination justify-content-center">
						<a class="page-link" aria-label="Previous">
							<span aria-hidden="true">&laquo;</span>
						</a>
						@for (map of maps; track $index; let idx = $index) {
							<li class="page-item">
								<a class="page-link" [routerLink]="'/manager/maps/' + map.id + '/areas'">{{ idx + 1 }}</a>
							</li>
						}
						@for (area of areas; track $index; let idx = $index) {
							<li class="page-item">
								<a class="page-link" [routerLink]="'/manager/maps/' + idMap + '/areas/' + area.id">{{ idx + 1 }}</a>
							</li>
						}
						<a class="page-link" aria-label="Next">
							<span aria-hidden="true">&raquo;</span>
						</a>
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
	@Input()
	idMap: number | undefined;

	@Input()
	areas: Array<Area> | undefined;

	constructor() {}

	ngOnInit(): void {}
}
