import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type BarChartItem = { label: string; value: number };

@Component({
	selector: 'mini-bar-chart',
	template: `
		@if (!items().length) {
			<p class="text-body-secondary mb-0">Todavía no hay datos suficientes.</p>
		} @else {
			<div class="mini-bar-chart">
				@for (item of items(); track item.label) {
					<div class="mini-bar-row">
						<span class="mini-bar-label">{{ item.label }}</span>
						<div class="mini-bar-track">
							<div class="mini-bar-fill" [style.width.%]="max() ? (item.value / max()) * 100 : 0"></div>
						</div>
						<span class="mini-bar-value">{{ item.value }}{{ suffix }}</span>
					</div>
				}
			</div>
		}
	`,
	styles: [
		`
			.mini-bar-chart {
				display: flex;
				flex-direction: column;
				gap: 0.6rem;
			}
			.mini-bar-row {
				display: grid;
				grid-template-columns: 7rem 1fr 4rem;
				align-items: center;
				gap: 0.6rem;
			}
			.mini-bar-label {
				font-size: 0.85rem;
				color: #adb5bd;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.mini-bar-track {
				background: #2a2f36;
				border-radius: 0.25rem;
				height: 0.9rem;
				overflow: hidden;
			}
			.mini-bar-fill {
				background: var(--app-accent);
				height: 100%;
				border-radius: 0.25rem;
				transition: width 0.3s ease;
			}
			.mini-bar-value {
				font-size: 0.85rem;
				text-align: right;
				font-variant-numeric: tabular-nums;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MiniBarChartComponent {
	@Input() set data(value: BarChartItem[] | null | undefined) {
		this._data = value ?? [];
		this._max = Math.max(0, ...this._data.map((d) => d.value));
	}
	@Input() suffix = '';

	private _data: BarChartItem[] = [];
	private _max = 0;

	items(): BarChartItem[] {
		return this._data;
	}

	max(): number {
		return this._max;
	}
}
