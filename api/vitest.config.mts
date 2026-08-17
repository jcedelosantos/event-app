import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		setupFiles: ['./tests/setup.ts'],
		// Los tests pegan contra una Postgres real compartida (integ_app_test, ver tests/setup.ts) —
		// correr archivos en paralelo arriesgaría que dos suites pisen los mismos datos. Con el
		// volumen actual de tests, serial es simple y suficiente; revisar si la suite crece mucho.
		fileParallelism: false,
		testTimeout: 15000,
	},
});
