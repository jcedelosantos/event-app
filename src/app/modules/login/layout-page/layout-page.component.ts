import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
	selector: 'app-layout-page',
	templateUrl: './layout-page.component.html',
	styleUrl: './layout-page.component.css',
	imports: [RouterOutlet],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutPageComponent {}
