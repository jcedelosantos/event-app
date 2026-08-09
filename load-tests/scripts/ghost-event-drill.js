// Fase 3 — el simulacro en sí: combina TODO a la vez sobre el evento fantasma generado por
// ghost-event-setup.js — scanners online en 3 puertas (una restringida a VIP), dispositivos
// "offline" que sincronizan en lote (algunos generan conflictos reales a propósito, escaneando el
// mismo codeQR desde 2 "dispositivos" con clientScannedAt distinto), y watchers de dashboard
// pidiendo stats en vivo — todo en simultáneo, durante una corrida sostenida.
//
// Uso: API_URL=... node scripts/ghost-event-drill.js
// Variables: DURATION_MIN (default 8), ONLINE_SCANNERS (6), OFFLINE_DEVICES (4), WATCHERS (3)

const fs = require('fs');

const fixture = JSON.parse(fs.readFileSync(`${__dirname}/../.fixtures/ghost-event.json`, 'utf8'));
const API = fixture.apiUrl;
if (!API || API.includes('seat-app-production')) {
	console.error('El fixture apunta a producción — aborta.');
	process.exit(1);
}

const DURATION_MS = Number(process.env.DURATION_MIN ?? 8) * 60_000;
const ONLINE_SCANNERS = Number(process.env.ONLINE_SCANNERS ?? 6);
const OFFLINE_DEVICES = Number(process.env.OFFLINE_DEVICES ?? 4);
const WATCHERS = Number(process.env.WATCHERS ?? 3);

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${fixture.token}` };
async function api(method, path, body) {
	const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}
	return { status: res.status, data };
}

// --- Repartición de codeQRs entre los 3 modos de uso, sin superposición entre grupos ---
const allGeneral = fixture.generalCodeQRs;
const allVip = fixture.vipCodeQRs;
const allChild = fixture.childCodeQRs;

function splitByRatio(arr, ratios) {
	let i = 0;
	return ratios.map((r) => {
		const n = Math.floor(arr.length * r);
		const slice = arr.slice(i, i + n);
		i += n;
		return slice;
	});
}

const [onlineGeneral, offlineSingleGeneral, offlineConflictGeneral] = splitByRatio(allGeneral, [0.6, 0.3, 0.1]);
const [onlineVip, offlineSingleVip] = splitByRatio(allVip, [0.7, 0.3]);
const [onlineChild, offlineSingleChild] = splitByRatio(allChild, [0.7, 0.3]);

const onlinePool = [
	...onlineGeneral.map((codeQR) => ({ codeQR, accessPointId: fixture.accessPoints.principal })),
	...onlineVip.map((codeQR) => ({ codeQR, accessPointId: fixture.accessPoints.vip })),
	...onlineChild.map((codeQR) => ({ codeQR, accessPointId: fixture.accessPoints.familias })),
	// Deliberado: algunos General intentan entrar por la puerta VIP (restringida) — debe rechazar.
	...onlineGeneral.slice(0, Math.min(20, onlineGeneral.length)).map((codeQR) => ({ codeQR, accessPointId: fixture.accessPoints.vip, expectDenied: true })),
];

const offlineSinglePool = [...offlineSingleGeneral, ...offlineSingleVip, ...offlineSingleChild];
const offlineConflictPool = offlineConflictGeneral; // estos SÍ se escanean 2 veces con timestamps distintos

console.log(`Pools: online=${onlinePool.length} offline-single=${offlineSinglePool.length} offline-conflict=${offlineConflictPool.length}`);

const stats = { online: { ok: 0, denied: 0, already: 0, error: 0 }, sync: { applied: 0, conflict: 0, error: 0 }, watch: { ok: 0, error: 0 } };
let stop = false;
setTimeout(() => {
	stop = true;
}, DURATION_MS);

function pick(pool, idx) {
	return pool.length ? pool[idx % pool.length] : null;
}

async function onlineScannerWorker(id) {
	let i = id;
	while (!stop) {
		const item = pick(onlinePool, i);
		i += ONLINE_SCANNERS;
		if (!item) break;
		const { data, status } = await api('POST', '/scan', { codeQR: item.codeQR, accessPointId: item.accessPointId });
		if (status === 200) stats.online.ok++;
		else if (status === 403) stats.online.denied++;
		else if (status === 409) stats.online.already++;
		else stats.online.error++;
		await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
	}
}

async function offlineSingleWorker(id) {
	let i = id;
	while (!stop) {
		const codeQR = pick(offlineSinglePool, i);
		i += OFFLINE_DEVICES;
		if (!codeQR) break;
		const clientScannedAt = new Date(Date.now() - Math.floor(Math.random() * 5 * 60_000)).toISOString();
		const { data, status } = await api('POST', '/scan/sync', { items: [{ tempId: `single-${id}-${i}`, codeQR, clientScannedAt, accessPointId: fixture.accessPoints.familias }] });
		const r = data?.results?.[0]?.status;
		if (r === 'applied') stats.sync.applied++;
		else if (r === 'conflict') stats.sync.conflict++;
		else stats.sync.error++;
		await new Promise((r2) => setTimeout(r2, 400 + Math.random() * 400));
	}
}

// Cada codeQR de este pool lo "sincronizan" 2 dispositivos distintos con timestamps distintos —
// dispara la reconciliación real de scan.ts (gana el más temprano, el otro queda ScanConflict).
async function offlineConflictWorker(deviceLabel) {
	for (const codeQR of offlineConflictPool) {
		if (stop) break;
		const minutesAgo = deviceLabel === 'A' ? 10 : 6; // A "escaneó" antes que B → A debería ganar
		const clientScannedAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
		const { data, status } = await api('POST', '/scan/sync', { items: [{ tempId: `conflict-${deviceLabel}-${codeQR}`, codeQR, clientScannedAt, accessPointId: fixture.accessPoints.familias }] });
		const r = data?.results?.[0]?.status;
		if (r === 'applied') stats.sync.applied++;
		else if (r === 'conflict') stats.sync.conflict++;
		else stats.sync.error++;
		await new Promise((r2) => setTimeout(r2, 300 + Math.random() * 300));
	}
}

async function watcherWorker(id) {
	while (!stop) {
		try {
			const [a, b, c] = await Promise.all([
				api('GET', `/sale-tickets?eventId=${fixture.eventId}`),
				api('GET', `/access-points/stats?eventId=${fixture.eventId}`),
				api('GET', `/scan/conflicts?eventId=${fixture.eventId}`),
			]);
			if (a.status < 400 && b.status < 400 && c.status < 400) stats.watch.ok++;
			else stats.watch.error++;
		} catch {
			stats.watch.error++;
		}
		await new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
	}
}

async function main() {
	console.log(`Arrancando simulacro por ${DURATION_MS / 60_000} min: ${ONLINE_SCANNERS} scanners online, ${OFFLINE_DEVICES} dispositivos offline, ${WATCHERS} watchers de dashboard...`);
	const workers = [
		...Array.from({ length: ONLINE_SCANNERS }, (_, i) => onlineScannerWorker(i)),
		...Array.from({ length: OFFLINE_DEVICES }, (_, i) => offlineSingleWorker(i)),
		offlineConflictWorker('A'),
		offlineConflictWorker('B'),
		...Array.from({ length: WATCHERS }, (_, i) => watcherWorker(i)),
	];
	await Promise.all(workers);

	console.log('\n=== Resultado del simulacro ===');
	console.log('Online (POST /scan):', JSON.stringify(stats.online));
	console.log('Offline (POST /scan/sync):', JSON.stringify(stats.sync));
	console.log('Watchers (dashboard):', JSON.stringify(stats.watch));

	const finalStats = await api('GET', `/access-points/stats?eventId=${fixture.eventId}`);
	const conflicts = await api('GET', `/scan/conflicts?eventId=${fixture.eventId}`);
	console.log('\nStats finales por puerta:', JSON.stringify(finalStats.data, null, 2));
	console.log(`\nConflictos sin resolver: ${conflicts.data?.length ?? 'error'}`);

	fs.writeFileSync(
		`${__dirname}/../results/ghost-event-raw.json`,
		JSON.stringify({ stats, finalStats: finalStats.data, conflictsCount: conflicts.data?.length, eventId: fixture.eventId }, null, 2),
	);
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
