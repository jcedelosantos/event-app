import { inject, Injectable } from '@angular/core';
import { SettingsService } from './settings.service';

export const ACCENT_SETTING_KEY = 'accentColor';
export const DEFAULT_ACCENT = '#1e3a8a';

function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace('#', '');
	const r = parseInt(clean.substring(0, 2), 16);
	const g = parseInt(clean.substring(2, 4), 16);
	const b = parseInt(clean.substring(4, 6), 16);
	return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// mix hacia negro (factor>0 oscurece) o hacia blanco (factor<0 aclara), estilo shade/tint de Sass.
function mix(hex: string, factor: number): string {
	const [r, g, b] = hexToRgb(hex);
	const target = factor > 0 ? 0 : 255;
	const t = Math.abs(factor);
	return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t);
}

// Toda la app corre en tema oscuro (data-bs-theme="dark" en los contenedores principales) — estas
// derivadas imitan cómo Bootstrap genera sus variantes -danger para dark mode: hover/active más
// oscuros para botones sólidos, texto de énfasis y fondo "subtle" más claros/tenues para que se
// lean sobre el fondo casi negro de la app.
@Injectable({
	providedIn: 'root',
})
export class ThemeService {
	private readonly settingsService = inject(SettingsService);

	init(): void {
		this.settingsService.getSettings().subscribe({
			next: (settings) => this.applyAccent(settings[ACCENT_SETTING_KEY] ?? DEFAULT_ACCENT),
			error: () => this.applyAccent(DEFAULT_ACCENT),
		});
	}

	applyAccent(hex: string): void {
		const root = document.documentElement.style;
		const [r, g, b] = hexToRgb(hex);
		const rgb = `${r}, ${g}, ${b}`;
		const hover = mix(hex, 0.15);
		const active = mix(hex, 0.25);
		const textEmphasis = mix(hex, -0.35);
		const bgSubtle = mix(hex, 0.75);
		const borderSubtle = mix(hex, 0.4);

		root.setProperty('--app-accent', hex);
		root.setProperty('--app-accent-rgb', rgb);
		root.setProperty('--app-accent-hover', hover);
		root.setProperty('--app-accent-active', active);
		root.setProperty('--app-accent-text-emphasis', textEmphasis);
		root.setProperty('--app-accent-bg-subtle', bgSubtle);
		root.setProperty('--app-accent-border-subtle', borderSubtle);
	}

	saveAccent(hex: string) {
		this.applyAccent(hex);
		return this.settingsService.setSetting(ACCENT_SETTING_KEY, hex);
	}
}
