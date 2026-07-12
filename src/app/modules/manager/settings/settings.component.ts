import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { SettingsService } from '../../../core/services/settings.service';
import { ACCENT_SETTING_KEY, DEFAULT_ACCENT, ThemeService } from '../../../core/services/theme.service';
import { extractErrorMessage } from '../../../utils/api-error';

const PRESETS = [
	{ name: 'Azul oscuro', hex: '#1e3a8a' },
	{ name: 'Rojo (original)', hex: '#dc3545' },
	{ name: 'Verde bosque', hex: '#14532d' },
	{ name: 'Morado', hex: '#5b21b6' },
	{ name: 'Naranja', hex: '#c2410c' },
];

@Component({
	selector: 'app-settings',
	imports: [],
	template: `
		<h2 class="section-title">Settings</h2>
		<p class="text-body-secondary small">Color de acento de toda la app: botones, badges, bordes y textos destacados.</p>

		<div class="card" style="max-width: 480px;">
			<div class="card-body">
				<div class="d-flex align-items-center gap-3 mb-3">
					<input type="color" class="form-control form-control-color" [value]="accent()" (input)="onColorInput($event)" title="Elegí el color de acento" />
					<div>
						<div class="fw-semibold">Color actual</div>
						<div class="text-body-secondary small">{{ accent() }}</div>
					</div>
				</div>

				<div class="mb-3">
					<div class="small text-body-secondary mb-1">Presets</div>
					<div class="d-flex flex-wrap gap-2">
						@for (preset of presets; track preset.hex) {
							<button
								type="button"
								class="btn btn-sm preset-btn"
								[class.active]="accent() === preset.hex"
								[style.background]="preset.hex"
								[title]="preset.name"
								(click)="onColorInput({ target: { value: preset.hex } })"
							></button>
						}
					</div>
				</div>

				<div class="d-flex gap-2 align-items-center">
					<button type="button" class="btn btn-danger btn-sm" [disabled]="saving()" (click)="save()">
						{{ saving() ? 'Guardando...' : 'Guardar' }}
					</button>
					<button type="button" class="btn btn-outline-secondary btn-sm" [disabled]="saving()" (click)="reset()">Restaurar default</button>
					@if (saved()) {
						<span class="text-success small"><i class="bi bi-check-circle" aria-hidden="true"></i> Guardado</span>
					}
				</div>

				@if (errorMessage()) {
					<div class="text-danger small mt-2">{{ errorMessage() }}</div>
				}

				<hr />
				<div class="small text-body-secondary">Vista previa:</div>
				<div class="d-flex flex-wrap gap-2 mt-2">
					<button type="button" class="btn btn-danger btn-sm">Botón primario</button>
					<button type="button" class="btn btn-outline-danger btn-sm">Botón outline</button>
					<span class="badge text-bg-danger">Badge</span>
					<span class="text-danger small align-self-center">Texto destacado</span>
				</div>
			</div>
		</div>
	`,
	styleUrl: './settings.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
	private readonly settingsService = inject(SettingsService);
	private readonly themeService = inject(ThemeService);

	presets = PRESETS;
	accent = signal(DEFAULT_ACCENT);
	saving = signal(false);
	saved = signal(false);
	errorMessage = signal('');

	ngOnInit(): void {
		this.settingsService.getSettings().subscribe((settings) => {
			this.accent.set(settings[ACCENT_SETTING_KEY] ?? DEFAULT_ACCENT);
		});
	}

	onColorInput(event: Event | { target: { value: string } }) {
		const value = (event.target as HTMLInputElement).value;
		this.accent.set(value);
		this.saved.set(false);
		// Preview instantáneo mientras se elige, sin esperar a "Guardar".
		this.themeService.applyAccent(value);
	}

	save() {
		this.saving.set(true);
		this.errorMessage.set('');
		this.themeService.saveAccent(this.accent()).subscribe({
			next: () => {
				this.saving.set(false);
				this.saved.set(true);
			},
			error: (err: HttpErrorResponse) => {
				this.saving.set(false);
				this.errorMessage.set(extractErrorMessage(err));
			},
		});
	}

	reset() {
		this.accent.set(DEFAULT_ACCENT);
		this.themeService.applyAccent(DEFAULT_ACCENT);
		this.saved.set(false);
	}
}
