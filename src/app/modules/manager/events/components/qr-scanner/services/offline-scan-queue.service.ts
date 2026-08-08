import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../../../../environments/environment';
import { ConnectivityService } from '../../../../../../core/services/connectivity.service';

const QUEUE_KEY = 'seat-app:offline-scan-queue';
// No todo depende de que el evento `online` del navegador dispare confiable (conexiones
// intermitentes a veces no lo disparan) — este timer de respaldo reintenta cada 30s mientras haya
// pendientes.
const AUTO_SYNC_INTERVAL_MS = 30_000;

export interface PendingScanItem {
	tempId: string;
	codeQR: string;
	accessPointId?: number | null;
	mode?: 'pickup' | 'meal';
	// ISO — la hora REAL del escaneo (cuándo el operador lo hizo), no cuándo se sincronizó. El
	// backend usa esto para decidir quién "ganó" si dos dispositivos offline escanearon el mismo
	// QR (ver reconcileEntity en api/src/routes/scan.ts).
	clientScannedAt: string;
}

type SyncItemResult = { tempId: string; status: 'applied' | 'conflict' | 'error'; error?: string };

// Cola de escaneos hechos sin conexión, persistida en localStorage (mismo patrón ad hoc que
// GATE_SELECTION_KEY en qr-scanner.component.ts — el volumen real, unos cientos de escaneos por
// evento, no justifica IndexedDB). Nunca bloquea a un operador en la puerta por falta de señal:
// encolar siempre "aprueba" localmente, la reconciliación real pasa después, al sincronizar.
@Injectable({ providedIn: 'root' })
export class OfflineScanQueueService {
	private readonly httpClient = inject(HttpClient);
	private readonly connectivity = inject(ConnectivityService);
	private readonly baseUrl = `${environment.apiUrl}/scan/sync`;
	private syncing = false;
	private autoSyncTimer: ReturnType<typeof setInterval> | null = null;

	queue = signal<PendingScanItem[]>(this.readFromStorage());
	pending = computed(() => this.queue().length);

	constructor() {
		if (typeof window !== 'undefined') {
			window.addEventListener('online', () => this.trySync());
		}
		this.autoSyncTimer = setInterval(() => {
			if (this.queue().length) this.trySync();
		}, AUTO_SYNC_INTERVAL_MS);
	}

	private readFromStorage(): PendingScanItem[] {
		if (typeof localStorage === 'undefined') return [];
		try {
			const raw = localStorage.getItem(QUEUE_KEY);
			return raw ? JSON.parse(raw) : [];
		} catch {
			return [];
		}
	}

	private persist(items: PendingScanItem[]) {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
		}
	}

	// Evita encolar el mismo QR dos veces mientras sigue pendiente de sincronizar — el propio
	// dispositivo ya sabe que lo tiene guardado, no hace falta duplicar el intento.
	isQueued(codeQR: string): boolean {
		return this.queue().some((item) => item.codeQR === codeQR);
	}

	enqueue(item: { codeQR: string; accessPointId?: number | null; mode?: 'pickup' | 'meal' }): PendingScanItem {
		const pendingItem: PendingScanItem = {
			...item,
			tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
			clientScannedAt: new Date().toISOString(),
		};
		const next = [...this.queue(), pendingItem];
		this.queue.set(next);
		this.persist(next);
		if (this.connectivity.online()) this.trySync();
		return pendingItem;
	}

	trySync(): void {
		if (this.syncing || !this.connectivity.online() || !this.queue().length) return;
		this.syncing = true;
		const items = this.queue();
		this.httpClient.post<{ results: SyncItemResult[] }>(this.baseUrl, { items }).subscribe({
			next: ({ results }) => {
				// 'error' se deja en la cola para reintentar (ej. un problema transitorio del server) —
				// 'applied'/'conflict' ya quedaron resueltos del lado del servidor, se sacan de acá.
				const doneIds = new Set(results.filter((r) => r.status !== 'error').map((r) => r.tempId));
				const remaining = this.queue().filter((item) => !doneIds.has(item.tempId));
				this.queue.set(remaining);
				this.persist(remaining);
				this.syncing = false;
			},
			error: () => {
				this.syncing = false;
			},
		});
	}
}
