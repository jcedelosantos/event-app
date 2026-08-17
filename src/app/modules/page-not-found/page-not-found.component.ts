import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
	selector: 'app-page-not-found',
	imports: [],
	template: `
		<h2>Página no encontrada</h2>
		<p>No pudimos encontrar esa página. Ni con visión de rayos X.</p>
	`,
	styleUrl: './page-not-found.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageNotFoundComponent {}
