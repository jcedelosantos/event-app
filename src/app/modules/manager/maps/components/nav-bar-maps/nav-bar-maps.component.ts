import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-nav-bar-maps',
	imports: [],
	template: `
		<div class="d-flex flex-wrap align-items-center gap-2 mb-3">
			<button type="button" class="btn btn-danger" data-bs-toggle="modal" data-bs-target="#createMapModal">Crear</button>
			<input class="form-control" style="max-width: 220px" type="search" placeholder="Nombre" aria-label="Buscar" />
			<input class="form-control" style="max-width: 220px" type="search" placeholder="Ubicación" aria-label="Buscar" />
			<button class="btn btn-outline-danger" type="button">Buscar</button>
			<nav aria-label="Navegación de páginas" class="ms-auto">
				<ul class="pagination mb-0">
					<li class="page-item">
						<a class="page-link" aria-label="Anterior">
							<span aria-hidden="true">&laquo;</span>
						</a>
					</li>
					<li class="page-item"><a class="page-link">1</a></li>
					<li class="page-item"><a class="page-link">2</a></li>
					<li class="page-item"><a class="page-link">3</a></li>
					<li class="page-item">
						<a class="page-link" aria-label="Siguiente">
							<span aria-hidden="true">&raquo;</span>
						</a>
					</li>
				</ul>
			</nav>
		</div>
	`,
	styleUrl: './nav-bar-maps.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavBarMapsComponent {}
