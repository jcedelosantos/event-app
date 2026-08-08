import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanService, ScanResult } from '../../../qrs/services/scan.service';
import { Child } from '../../../qrs/services/children.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { AccessPointsService } from '../../../access-points/services/access-points.service';
import { AccessPoint } from '../../../../../models/access-points/access-point';

// Recuerda la última puerta elegida EN ESTE DISPOSITIVO — mismo idiom ad hoc que
// sidebarCollapsed/token de auth en el resto de la app (no hay un helper de "signal persistido"
// compartido todavía). No hace falta acotarla por evento: el operador de un puesto fijo (ej. "la
// tablet de VIP") normalmente escanea siempre desde la misma puerta, sea cual sea el evento del día.
const GATE_SELECTION_KEY = 'seat-app:last-access-point-id';

type ScanAction = { message: string; ok: boolean; time: Date };

// El lector de cámara (fps:10) sigue decodificando el mismo QR mientras esté en cuadro — sin
// pausa, la misma tarjeta se escanea varias veces por segundo apenas termina la request anterior,
// más rápido de lo que el operador puede reaccionar o alejar el código de la cámara. Este cooldown
// bloquea nuevas lecturas por un rato después de cada escaneo (éxito o error), dando tiempo real
// entre una lectura y la siguiente.
const SCAN_COOLDOWN_MS = 2500;

@Component({
	selector: 'app-qr-scanner',
	imports: [ReactiveFormsModule, FormsModule, DatePipe],
	templateUrl: './qr-scanner.component.html',
	styleUrl: './qr-scanner.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrScannerComponent implements OnInit, AfterViewInit, OnDestroy {
	private readonly scanService = inject(ScanService);
	private readonly authService = inject(AuthService);
	private readonly accessPointsService = inject(AccessPointsService);
	isChurchTenant = computed(() => this.authService.currentUser()?.tenant?.type === 'CHURCH');
	private scanner: Html5Qrcode | null = null;
	private processing = false;
	private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

	scannerForm = new FormGroup({ code: new FormControl<string>('', [Validators.required]) });

	cameraError = signal('');
	lastActions = signal<ScanAction[]>([]);
	lastResult = signal<ScanResult | null>(null);
	cooling = signal(false);

	// Solo aplica cuando el código escaneado es un talón familiar (Child) — retiro del niño y
	// entrega de comida son dos acciones independientes (ver scan.ts), este selector decide cuál
	// hace el próximo escaneo. Queda en memoria entre escaneos porque normalmente un mismo puesto
	// (comida, o salida) escanea todo un rato en el mismo modo.
	childScanMode = signal<'pickup' | 'meal'>('pickup');

	accessPoints = signal<AccessPoint[]>([]);
	selectedAccessPointId = signal<number | null>(typeof localStorage !== 'undefined' ? Number(localStorage.getItem(GATE_SELECTION_KEY)) || null : null);

	ngOnInit(): void {
		this.accessPointsService.getAll().subscribe((accessPoints) => this.accessPoints.set(accessPoints));
	}

	onGateChange(accessPointId: string) {
		const id = accessPointId ? Number(accessPointId) : null;
		this.selectedAccessPointId.set(id);
		if (typeof localStorage !== 'undefined') {
			if (id) localStorage.setItem(GATE_SELECTION_KEY, String(id));
			else localStorage.removeItem(GATE_SELECTION_KEY);
		}
	}

	async ngAfterViewInit(): Promise<void> {
		try {
			const devices = await Html5Qrcode.getCameras();
			if (!devices.length) {
				this.cameraError.set('No se encontró ninguna cámara — usá el código manual.');
				return;
			}
			this.scanner = new Html5Qrcode('qr-reader');
			await this.scanner.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 250, height: 250 } },
				(decodedText) => this.handleScan(decodedText),
				() => {},
			);
		} catch {
			this.cameraError.set('No se pudo acceder a la cámara — usá el código manual.');
		}
	}

	async ngOnDestroy(): Promise<void> {
		if (this.cooldownTimer) clearTimeout(this.cooldownTimer);
		if (this.scanner) {
			try {
				await this.scanner.stop();
			} catch {
				// El scanner ya pudo haberse detenido solo (ej. permiso revocado).
			}
		}
	}

	handleScan(codeQR: string) {
		if (this.processing || this.cooling()) return;
		this.processing = true;
		this.scan(codeQR).add(() => {
			this.processing = false;
			this.cooling.set(true);
			this.cooldownTimer = setTimeout(() => this.cooling.set(false), SCAN_COOLDOWN_MS);
		});
	}

	onSubmit() {
		const code = this.scannerForm.value.code;
		if (!code) return;
		this.scan(code);
		this.scannerForm.reset();
	}

	private scan(codeQR: string) {
		return this.scanService.scan(codeQR, this.childScanMode(), this.selectedAccessPointId()).subscribe({
			next: (result) => {
				this.lastResult.set(result);
				if (result.type === 'ticket') {
					const { saleTicket } = result;
					this.pushAction(`✔ ${saleTicket.client.name} ${saleTicket.client.lastname} — ${saleTicket.event.name} / ${saleTicket.seat.name}`, true);
				} else if (result.type === 'product') {
					const { saleProduct } = result;
					this.pushAction(`✔ ${saleProduct.client.name} ${saleProduct.client.lastname} — ${saleProduct.product.name} x${saleProduct.quantity}`, true);
				} else {
					const verb = this.childScanMode() === 'meal' ? 'Comida entregada' : 'Retiro';
					this.pushAction(`✔ ${verb}: ${this.familyLabel(result.children)}`, true);
				}
			},
			error: (err: HttpErrorResponse) => {
				const body = err.error as { error?: string; type?: 'ticket' | 'product' | 'child'; saleTicket?: any; saleProduct?: any; children?: any[] };
				if (err.status === 403 && (body?.saleTicket || body?.saleProduct)) {
					// Todavía no se abrió la ventana de entrada (1h antes del evento) — mismo shape que el 409
					// pero el motivo es otro, usamos el mensaje del backend en vez de "Ya fue escaneado".
					if (body.saleTicket) this.lastResult.set({ type: 'ticket', ok: true, saleTicket: body.saleTicket });
					else this.lastResult.set({ type: 'product', ok: true, saleProduct: body.saleProduct });
					this.pushAction(`✘ ${body.error}`, false);
				} else if (body?.type === 'ticket' && body.saleTicket) {
					this.lastResult.set({ type: 'ticket', ok: true, saleTicket: body.saleTicket });
					this.pushAction(`✘ Ya fue escaneado — ${body.saleTicket.client.name} ${body.saleTicket.client.lastname} (${new Date(body.saleTicket.checkedInAt!).toLocaleString()})`, false);
				} else if (body?.type === 'product' && body.saleProduct) {
					this.lastResult.set({ type: 'product', ok: true, saleProduct: body.saleProduct });
					this.pushAction(`✘ Ya fue entregado — ${body.saleProduct.client.name} ${body.saleProduct.client.lastname} (${new Date(body.saleProduct.deliveredAt).toLocaleString()})`, false);
				} else if (body?.type === 'child' && body.children) {
					this.lastResult.set({ type: 'child', ok: true, children: body.children });
					// El backend ya manda el mensaje correcto según el modo (ver scan.ts): "ya fue
					// retirada", "ya fue entregada" o "no tiene comida del día para retirar".
					this.pushAction(`✘ ${body.error} — ${this.familyLabel(body.children)}`, false);
				} else {
					this.lastResult.set(null);
					this.pushAction(`✘ ${body?.error ?? 'Código no válido'}`, false);
				}
			},
		});
	}

	// "Padre/Madre — Hijo1 (edad), Hijo2 (edad)" — un solo talón familiar entrega la comida de todos
	// los hermanos pendientes a la vez (ver scan.ts), así que acá se muestran todos juntos en vez de
	// un resultado por niño.
	familyLabel(children: Child[]): string {
		if (!children.length) return '';
		const parent = children[0].parent;
		const kids = children.map((c) => `${c.name}${c.age != null ? ` (${c.age})` : ''}`).join(', ');
		return `${parent.name} ${parent.lastname} — ${kids}`;
	}

	private pushAction(message: string, ok: boolean) {
		this.lastActions.update((actions) => [{ message, ok, time: new Date() }, ...actions].slice(0, 30));
	}
}
