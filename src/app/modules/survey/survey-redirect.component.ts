import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SurveyService } from './services/survey.service';

type State = 'loading' | 'not-ready' | 'not-found' | 'error';

@Component({
	selector: 'app-survey-redirect',
	standalone: true,
	template: `
		<div class="page d-flex align-items-center justify-content-center" data-bs-theme="dark" style="min-height: 100vh;">
			<div class="text-center" style="max-width: 480px;">
				@switch (state()) {
					@case ('loading') {
						<div class="spinner-border text-danger" role="status"></div>
					}
					@case ('not-ready') {
						<h1 class="h4">Todavía no</h1>
						<p style="color: #b9b9b9;">La encuesta se habilita apenas termine el evento — probá de nuevo más tarde.</p>
					}
					@case ('not-found') {
						<h1 class="h4">No encontramos esta encuesta</h1>
						<p style="color: #b9b9b9;">Revisá el link del correo, puede que ya no esté disponible.</p>
					}
					@case ('error') {
						<h1 class="h4">Algo salió mal</h1>
						<p style="color: #b9b9b9;">No pudimos cargar la encuesta — probá de nuevo en un momento.</p>
					}
				}
			</div>
		</div>
	`,
	styles: `
		.page {
			background: #0a0a0a;
			color: #fff;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyRedirectComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly surveyService = inject(SurveyService);

	state = signal<State>('loading');

	ngOnInit(): void {
		const code = this.route.snapshot.paramMap.get('code');
		if (!code) {
			this.state.set('not-found');
			return;
		}
		this.surveyService.getStatus(code).subscribe({
			next: (result) => {
				if (result.ready) {
					// Redirect completo: surveyUrl es un sitio externo (Google Forms, Typeform, etc.).
					window.location.href = result.surveyUrl;
					return;
				}
				this.state.set('not-ready');
			},
			error: (err) => this.state.set(err?.status === 404 ? 'not-found' : 'error'),
		});
	}
}
