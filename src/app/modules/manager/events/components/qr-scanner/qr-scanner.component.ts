import { AfterViewInit, ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Html5Qrcode } from 'html5-qrcode';
import { ScanService, ScanResult } from '../../../qrs/services/scan.service';
import { Child } from '../../../qrs/services/children.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { AccessPointsService } from '../../../access-points/services/access-points.service';
import { AccessPoint } from '../../../../../models/access-points/access-point';
import { ConnectivityService } from '../../../../../core/services/connectivity.service';
import { OfflineScanQueueService } from './services/offline-scan-queue.service';

// Recuerda la última puerta elegida EN ESTE DISPOSITIVO — mismo idiom ad hoc que
// sidebarCollapsed/token de auth en el resto de la app (no hay un helper de "signal persistido"
// compartido todavía). No hace falta acotarla por evento: el operador de un puesto fijo (ej. "la
// tablet de VIP") normalmente escanea siempre desde la misma puerta, sea cual sea el evento del día.
const GATE_SELECTION_KEY = 'seat-app:last-access-point-id';

type ScanAction = { message: string; ok: boolean; pending?: boolean; time: Date };

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
	private readonly route = inject(ActivatedRoute);
	readonly connectivity = inject(ConnectivityService);
	readonly offlineQueue = inject(OfflineScanQueueService);
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

	// Si el usuario Escáner tiene puerta fija asignada (ver User.accessPointId), el selector se
	// reemplaza por un texto fijo — el backend igual la exige (ver scannerAccessPointDenialError en
	// scan.ts), mostrar un selector editable que de todas formas va a ser rechazado solo confunde.
	lockedAccessPointId = computed(() => this.authService.currentUser()?.accessPointId ?? null);
	lockedAccessPointName = computed(() => this.accessPoints().find((gate) => gate.id === this.lockedAccessPointId())?.name ?? '');

	ngOnInit(): void {
		// Un usuario tipo Escáner tiene un solo evento asignado (User.scannerEventId) — mostrarle
		// puertas de otros eventos no tiene sentido y confunde en el momento de elegir. El resto de
		// los usuarios (Admin/Usuario) no tienen un evento único al que acotarse por rol, pero el
		// botón "Escáner QR" de la pantalla de QRs (ver qrs.component.html) manda el evento que
		// tenían filtrado ahí como ?eventId=X — se usa lo mismo para acotar acá y evitar que quede
		// precargada (por el localStorage de la puerta anterior, ver GATE_SELECTION_KEY) una puerta
		// de OTRO evento, algo que podría pasar desapercibido para quien está escaneando.
		const scannerEventId = this.authService.currentUser()?.scannerEventId;
		const eventIdParam = Number(this.route.snapshot.queryParamMap.get('eventId')) || null;
		const scopedEventId = scannerEventId ?? eventIdParam;
		const accessPoints$ = scopedEventId ? this.accessPointsService.getByEvent(scopedEventId) : this.accessPointsService.getAll();
		accessPoints$.subscribe((accessPoints) => {
			this.accessPoints.set(accessPoints);
			if (this.lockedAccessPointId() != null) {
				this.selectedAccessPointId.set(this.lockedAccessPointId());
				return;
			}
			if (eventIdParam) {
				const currentId = this.selectedAccessPointId();
				if (currentId != null && !accessPoints.some((ap) => ap.id === currentId)) {
					// La puerta recordada en este dispositivo no pertenece al evento que se está por
					// escanear — mejor forzar una elección explícita que arriesgar que quede
					// seleccionada la de otro evento sin que nadie lo note.
					this.onGateChange('');
				}
				// Con una sola puerta para el evento no tiene sentido obligar a elegirla a mano.
				if (this.selectedAccessPointId() == null && accessPoints.length === 1) {
					this.onGateChange(String(accessPoints[0].id));
				}
			}
		});
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
				this.cameraError.set('No se encontró ninguna cámara — usa el código manual.');
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
			this.cameraError.set('No se pudo acceder a la cámara — usa el código manual.');
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
		this.scan(codeQR, () => {
			this.processing = false;
			this.cooling.set(true);
			this.cooldownTimer = setTimeout(() => this.cooling.set(false), SCAN_COOLDOWN_MS);
		});
	}

	onSubmit() {
		const code = this.scannerForm.value.code;
		if (!code) return;
		this.scan(code, () => {});
		this.scannerForm.reset();
	}

	syncNow() {
		this.offlineQueue.trySync();
	}

	// Sin conexión (o si la request ni llega al servidor pese a lo que diga navigator.onLine, ej.
	// portal cautivo), NUNCA se bloquea al operador en la puerta: se aprueba localmente y se encola
	// para sincronizar después (ver OfflineScanQueueService). Sin descargar la base de invitados, así
	// que no hay forma de mostrar nombre/asiento reales hasta que sincronice — el estado visual
	// (`pending: true`) deja claro que todavía no es un check-in confirmado por el servidor.
	private enqueueOffline(codeQR: string) {
		if (this.offlineQueue.isQueued(codeQR)) {
			this.pushAction(`⏳ Ya está en la cola local, pendiente de sincronizar`, true, true);
			return;
		}
		this.offlineQueue.enqueue({ codeQR, accessPointId: this.selectedAccessPointId(), mode: this.childScanMode() });
		this.lastResult.set(null);
		this.pushAction(`✔ Registrado localmente — pendiente de sincronizar`, true, true);
	}

	private scan(codeQR: string, onSettled: () => void) {
		if (!this.connectivity.online()) {
			this.enqueueOffline(codeQR);
			onSettled();
			return;
		}
		this.scanService.scan(codeQR, this.childScanMode(), this.selectedAccessPointId()).subscribe({
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
				onSettled();
			},
			error: (err: HttpErrorResponse) => {
				if (err.status === 0) {
					// La request ni llegó al servidor — mismo tratamiento que estar offline.
					this.enqueueOffline(codeQR);
					onSettled();
					return;
				}
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
				onSettled();
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

	private pushAction(message: string, ok: boolean, pending = false) {
		this.lastActions.update((actions) => [{ message, ok, pending, time: new Date() }, ...actions].slice(0, 30));
	}
}
