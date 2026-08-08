import { Injectable, signal } from '@angular/core';

// Envuelve navigator.onLine + los eventos online/offline en un signal — sin esto no hay forma de
// que el escáner (u otra pantalla) sepa cuándo intentar sincronizar la cola offline (ver
// OfflineScanQueueService) sin que el usuario recargue la página a mano.
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
	online = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

	constructor() {
		if (typeof window !== 'undefined') {
			window.addEventListener('online', () => this.online.set(true));
			window.addEventListener('offline', () => this.online.set(false));
		}
	}
}
