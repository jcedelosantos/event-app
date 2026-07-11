import { AfterViewInit, ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanService, ScanResult } from '../../../qrs/services/scan.service';

type ScanAction = { message: string; ok: boolean; time: Date };

// El lector de cámara (fps:10) sigue decodificando el mismo QR mientras esté en cuadro — sin
// pausa, la misma tarjeta se escanea varias veces por segundo apenas termina la request anterior,
// más rápido de lo que el operador puede reaccionar o alejar el código de la cámara. Este cooldown
// bloquea nuevas lecturas por un rato después de cada escaneo (éxito o error), dando tiempo real
// entre una lectura y la siguiente.
const SCAN_COOLDOWN_MS = 2500;

@Component({
	selector: 'app-qr-scanner',
	imports: [ReactiveFormsModule, DatePipe],
	templateUrl: './qr-scanner.component.html',
	styleUrl: './qr-scanner.component.css',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrScannerComponent implements AfterViewInit, OnDestroy {
	private readonly scanService = inject(ScanService);
	private scanner: Html5Qrcode | null = null;
	private processing = false;
	private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

	scannerForm = new FormGroup({ code: new FormControl<string>('', [Validators.required]) });

	cameraError = signal('');
	lastActions = signal<ScanAction[]>([]);
	lastResult = signal<ScanResult | null>(null);
	cooling = signal(false);

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
		return this.scanService.scan(codeQR).subscribe({
			next: (result) => {
				this.lastResult.set(result);
				if (result.type === 'ticket') {
					const { saleTicket } = result;
					this.pushAction(`✔ ${saleTicket.client.name} ${saleTicket.client.lastname} — ${saleTicket.event.name} / ${saleTicket.seat.name}`, true);
				} else {
					const { saleProduct } = result;
					this.pushAction(`✔ ${saleProduct.client.name} ${saleProduct.client.lastname} — ${saleProduct.product.name} x${saleProduct.quantity}`, true);
				}
			},
			error: (err: HttpErrorResponse) => {
				const body = err.error as { error?: string; type?: 'ticket' | 'product'; saleTicket?: any; saleProduct?: any };
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
				} else {
					this.lastResult.set(null);
					this.pushAction(`✘ ${body?.error ?? 'Código no válido'}`, false);
				}
			},
		});
	}

	private pushAction(message: string, ok: boolean) {
		this.lastActions.update((actions) => [{ message, ok, time: new Date() }, ...actions].slice(0, 30));
	}
}
