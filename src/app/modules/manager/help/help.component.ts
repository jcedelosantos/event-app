import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

// Contenido estático, sin backend — un accordion de Bootstrap alcanza (misma librería que ya usa
// toda la app para modales, sin JS propio que mantener). Si el usuario quiere ajustar textos más
// adelante, es editar este archivo directo, no hay CMS ni AppSetting detrás.
type FaqItem = { question: string; answerHtml: string };

const FAQ: FaqItem[] = [
	{
		question: '¿Cómo creo mi primer evento?',
		answerHtml: `Tienes dos formas: <strong>Evento flash</strong> (botón en el Panel) para cargar nombre, lugar y cupo esperado en segundos, o
			<strong>Crear con guía</strong> (en Eventos) para un paso a paso completo con mapa y tickets incluidos. Cualquiera de las dos te deja el evento
			100% editable después desde su ficha.`,
	},
	{
		question: '¿Necesito un mapa de asientos para vender entradas?',
		answerHtml: `No. Un mapa (con mesas y asientos numerados) es para eventos con ubicación asignada. Si tu evento es de entrada libre/general, puedes
			vender tickets sin asignar un mapa — el evento igual queda completo.`,
	},
	{
		question: '¿Cómo genero y entrego un ticket a un cliente?',
		answerHtml: `Desde <strong>QRs</strong>, botón "Nuevo" — cargas los datos del comprador (o eliges uno ya existente) y el sistema genera el
			código QR automáticamente. Se le manda por correo con el QR y el PDF adjunto; también puedes reenviarlo o descargarlo tú mismo desde la
			misma pantalla.`,
	},
	{
		question: '¿Cómo escaneo los tickets en la puerta el día del evento?',
		answerHtml: `Desde <strong>QRs → Scanner</strong> (o el ícono de escáner en el evento) — si entras con el evento ya seleccionado en QRs, la puerta
			asignada a ese evento se precarga sola, para evitar escanear por error con la puerta de otro evento. Cada ticket es válido una sola vez — si
			alguien intenta entrar dos veces con el mismo código, el sistema lo marca como ya usado. Si tienes varias puertas configuradas, eliges por
			cuál estás escaneando para que las estadísticas de tráfico por puerta salgan correctas.`,
	},
	{
		question: '¿Qué pasa si no tengo internet el día del evento?',
		answerHtml: `El scanner sigue funcionando offline: guarda los escaneos en una cola local y los sincroniza apenas vuelve la conexión. Si dos
			dispositivos escanean el mismo ticket estando ambos sin conexión, el sistema resuelve el conflicto por quién escaneó primero al reconectar.`,
	},
	{
		question: '¿Puedo cobrar las entradas online?',
		answerHtml: `Sí, configurando PayPal y/o un link de pago manual en <strong>Configuración → Pagos</strong>. Después, en cada evento eliges el modo de
			cobro (ninguno, PayPal, link, o que el comprador elija). Esta función depende de tu plan — si no la ves disponible, revisa tu plan actual en
			el badge del menú lateral.`,
	},
	{
		question: '¿Cómo cambio de plan o veo mi factura?',
		answerHtml: `Tu plan y estado aparecen siempre en el menú lateral — haz clic ahí para ver el detalle y actualizar. El historial de facturas
			está en <strong>Facturas</strong>.`,
	},
	{
		question: '¿Qué es la "portada pública" y por qué no carga?',
		answerHtml: `Es una página pública con todos tus próximos eventos, para compartir con tus clientes (el link está en Configuración y en Eventos). Es una
			función de los planes Intermedio en adelante — si tu plan no la incluye, vas a ver un aviso explicándolo antes de intentar abrirla.`,
	},
	{
		question: '¿Puedo tener varios usuarios manejando la cuenta?',
		answerHtml: `Sí, desde <strong>Usuarios</strong> puedes crear cuentas adicionales para tu equipo (por ejemplo, alguien que solo escanea en la puerta
			el día del evento).`,
	},
];

@Component({
	selector: 'app-help',
	standalone: true,
	imports: [RouterLink],
	template: `
		<h2 class="section-title">Ayuda</h2>
		<p class="text-body-secondary">Preguntas frecuentes sobre cómo usar la plataforma día a día.</p>

		<div class="accordion" id="helpAccordion">
			@for (item of faq; track item.question; let i = $index) {
				<div class="accordion-item">
					<h2 class="accordion-header">
						<button
							class="accordion-button collapsed"
							type="button"
							data-bs-toggle="collapse"
							[attr.data-bs-target]="'#helpItem' + i"
						>
							{{ item.question }}
						</button>
					</h2>
					<div [id]="'helpItem' + i" class="accordion-collapse collapse" data-bs-parent="#helpAccordion">
						<div class="accordion-body" [innerHTML]="item.answerHtml"></div>
					</div>
				</div>
			}
		</div>

		<p class="text-body-secondary small mt-4">
			¿No encontraste lo que buscabas? Mandanos tu consulta desde
			<a routerLink="/manager/solicitudes">Solicitudes</a>.
		</p>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent {
	faq = FAQ;
}
