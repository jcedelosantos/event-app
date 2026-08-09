// Catálogo de servicios adicionales (segunda línea de ingresos, fuera de la suscripción) — mismo
// criterio que plans.ts: es código, no una tabla editable desde la UI, porque cambia poco y así
// nunca hay que sincronizar precios entre una tabla y el resto del sistema. El frontend
// (src/app/modules/manager/service-requests/services/addon-catalog.ts) mantiene su PROPIA copia —
// este repo no es un monorepo con paths compartidos entre api/ y el Angular de arriba, así que no
// hay forma de importar este archivo desde ahí sin reestructurar el proyecto (mismo comentario que
// ya existe en plans.ts).
//
// Precios en pesos dominicanos (RD$) — moneda distinta a la de los planes de suscripción (USD),
// nunca se mezclan en el mismo cálculo.

export type AddOnServiceCode =
	| 'SCANNER_RENTAL'
	| 'TABLET_RENTAL'
	| 'BADGE_PRINTER_RENTAL'
	| 'BADGE_PRINTING'
	| 'ONSITE_TECH'
	| 'CHECKIN_STAFF'
	| 'ACCESS_SUPERVISOR'
	| 'INITIAL_SETUP'
	| 'GATES_SETUP'
	| 'REMOTE_SUPPORT'
	| 'EMERGENCY_ONSITE_SUPPORT'
	| 'DEDICATED_INTERNET'
	| 'HOTSPOT_ROUTER'
	| 'WHATSAPP_INVITES'
	| 'SMS_INVITES'
	| 'EMAIL_CAMPAIGN'
	| 'QR_CUSTOM_DESIGN'
	| 'CUSTOM_EVENT_PORTAL'
	| 'WHITE_LABEL'
	| 'GUEST_LIST_IMPORT'
	| 'POST_EVENT_REPORT'
	| 'SPECIAL_INTEGRATION'
	| 'STAFF_TRAINING'
	| 'TRANSPORT_INSTALL';

export type AddOnServiceCategory = 'EQUIPO' | 'PERSONAL' | 'CONFIGURACION_SOPORTE' | 'CONECTIVIDAD' | 'COMUNICACION' | 'PERSONALIZACION';

// FIXED: precio unitario fijo, se multiplica por la cantidad. RANGE: rango orientativo, no se
// suma al total estimado. QUOTE: sin precio de lista, "a cotizar" — puede traer una nota de
// referencia (ver `note`) pero tampoco se suma al total.
export type AddOnPricingType = 'FIXED' | 'RANGE' | 'QUOTE';

export type AddOnServiceDefinition = {
	code: AddOnServiceCode;
	name: string;
	category: AddOnServiceCategory;
	modality: string;
	pricingType: AddOnPricingType;
	unitPriceDOP?: number;
	rangeMinDOP?: number;
	rangeMaxDOP?: number;
	note?: string;
};

export const ADDON_SERVICES: Record<AddOnServiceCode, AddOnServiceDefinition> = {
	SCANNER_RENTAL: { code: 'SCANNER_RENTAL', name: 'Renta de scanner/handheld', category: 'EQUIPO', modality: 'Por equipo/evento', pricingType: 'FIXED', unitPriceDOP: 2000 },
	TABLET_RENTAL: { code: 'TABLET_RENTAL', name: 'Renta de tablet para check-in', category: 'EQUIPO', modality: 'Por equipo/evento', pricingType: 'FIXED', unitPriceDOP: 2000 },
	BADGE_PRINTER_RENTAL: { code: 'BADGE_PRINTER_RENTAL', name: 'Renta de impresora de credenciales', category: 'EQUIPO', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 5000 },
	BADGE_PRINTING: { code: 'BADGE_PRINTING', name: 'Impresión de gafetes/credenciales', category: 'EQUIPO', modality: 'Por unidad', pricingType: 'FIXED', unitPriceDOP: 25 },
	ONSITE_TECH: { code: 'ONSITE_TECH', name: 'Personal técnico presencial', category: 'PERSONAL', modality: 'Por técnico/jornada', pricingType: 'FIXED', unitPriceDOP: 5000 },
	CHECKIN_STAFF: { code: 'CHECKIN_STAFF', name: 'Personal de check-in', category: 'PERSONAL', modality: 'Por persona/jornada', pricingType: 'FIXED', unitPriceDOP: 3500 },
	ACCESS_SUPERVISOR: { code: 'ACCESS_SUPERVISOR', name: 'Supervisor de acceso', category: 'PERSONAL', modality: 'Por jornada', pricingType: 'FIXED', unitPriceDOP: 7000 },
	INITIAL_SETUP: { code: 'INITIAL_SETUP', name: 'Configuración inicial del evento', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 4000 },
	GATES_SETUP: { code: 'GATES_SETUP', name: 'Configuración de puertas y scanners', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 2500 },
	REMOTE_SUPPORT: { code: 'REMOTE_SUPPORT', name: 'Soporte técnico remoto', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 3500 },
	EMERGENCY_ONSITE_SUPPORT: { code: 'EMERGENCY_ONSITE_SUPPORT', name: 'Soporte técnico presencial de emergencia', category: 'CONFIGURACION_SOPORTE', modality: 'Por visita', pricingType: 'FIXED', unitPriceDOP: 6000 },
	DEDICATED_INTERNET: { code: 'DEDICATED_INTERNET', name: 'Internet dedicado/backup para check-in', category: 'CONECTIVIDAD', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 10000 },
	HOTSPOT_ROUTER: { code: 'HOTSPOT_ROUTER', name: 'Router/Hotspot 4G/5G', category: 'CONECTIVIDAD', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 3500 },
	WHATSAPP_INVITES: {
		code: 'WHATSAPP_INVITES',
		name: 'Envío de invitaciones por WhatsApp',
		category: 'COMUNICACION',
		modality: 'Por volumen',
		pricingType: 'QUOTE',
		note: 'Desde RD$3,500 según cantidad',
	},
	SMS_INVITES: { code: 'SMS_INVITES', name: 'Envío de SMS', category: 'COMUNICACION', modality: 'Por mensaje/paquete', pricingType: 'QUOTE', note: 'Desde RD$2,500 según proveedor' },
	EMAIL_CAMPAIGN: { code: 'EMAIL_CAMPAIGN', name: 'Campaña de correo electrónico', category: 'COMUNICACION', modality: 'Por volumen', pricingType: 'FIXED', unitPriceDOP: 1500 },
	QR_CUSTOM_DESIGN: { code: 'QR_CUSTOM_DESIGN', name: 'Diseño/personalización de QR', category: 'PERSONALIZACION', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 2000 },
	CUSTOM_EVENT_PORTAL: { code: 'CUSTOM_EVENT_PORTAL', name: 'Portal del evento personalizado', category: 'PERSONALIZACION', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 4500 },
	WHITE_LABEL: { code: 'WHITE_LABEL', name: 'Branding / White Label', category: 'PERSONALIZACION', modality: 'Mensual o evento', pricingType: 'FIXED', unitPriceDOP: 5000 },
	GUEST_LIST_IMPORT: { code: 'GUEST_LIST_IMPORT', name: 'Importación/depuración de invitados', category: 'CONFIGURACION_SOPORTE', modality: 'Por base de datos', pricingType: 'FIXED', unitPriceDOP: 2500 },
	POST_EVENT_REPORT: {
		code: 'POST_EVENT_REPORT',
		name: 'Reporte personalizado post-evento',
		category: 'PERSONALIZACION',
		modality: 'Por reporte',
		pricingType: 'RANGE',
		rangeMinDOP: 2000,
		rangeMaxDOP: 5000,
	},
	SPECIAL_INTEGRATION: { code: 'SPECIAL_INTEGRATION', name: 'Integraciones especiales/API', category: 'CONFIGURACION_SOPORTE', modality: 'Por proyecto', pricingType: 'QUOTE' },
	STAFF_TRAINING: { code: 'STAFF_TRAINING', name: 'Capacitación al personal del cliente', category: 'PERSONAL', modality: 'Por sesión', pricingType: 'FIXED', unitPriceDOP: 7500 },
	TRANSPORT_INSTALL: { code: 'TRANSPORT_INSTALL', name: 'Transporte e instalación de equipos', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 2500 },
};

export type AddOnPackageCode = 'BASICO' | 'INTERMEDIO' | 'AVANZADO' | 'PRO_MAX';

export type AddOnPackageDefinition = {
	code: AddOnPackageCode;
	name: string;
	// Coincide con PlanCode de plans.ts a propósito — es el plan de suscripción al que este paquete
	// está pensado como sugerencia (ver create-service-request-modal, resalta el que coincide con
	// el plan actual del tenant), no una restricción real: cualquier tenant puede usar cualquier
	// paquete como punto de partida.
	planCode: AddOnPackageCode;
	items: Array<{ catalogCode: AddOnServiceCode; quantity: number }>;
};

export const ADDON_PACKAGES: Record<AddOnPackageCode, AddOnPackageDefinition> = {
	BASICO: {
		code: 'BASICO',
		name: 'Paquete Básico',
		planCode: 'BASICO',
		items: [
			{ catalogCode: 'SCANNER_RENTAL', quantity: 1 },
			{ catalogCode: 'INITIAL_SETUP', quantity: 1 },
			{ catalogCode: 'REMOTE_SUPPORT', quantity: 1 },
		],
	},
	INTERMEDIO: {
		code: 'INTERMEDIO',
		name: 'Paquete Intermedio',
		planCode: 'INTERMEDIO',
		items: [
			{ catalogCode: 'SCANNER_RENTAL', quantity: 2 },
			{ catalogCode: 'ONSITE_TECH', quantity: 1 },
			{ catalogCode: 'GATES_SETUP', quantity: 1 },
			{ catalogCode: 'REMOTE_SUPPORT', quantity: 1 },
		],
	},
	AVANZADO: {
		code: 'AVANZADO',
		name: 'Paquete Avanzado — Operación Presencial',
		planCode: 'AVANZADO',
		items: [
			{ catalogCode: 'SCANNER_RENTAL', quantity: 4 },
			{ catalogCode: 'ONSITE_TECH', quantity: 2 },
			{ catalogCode: 'GATES_SETUP', quantity: 1 },
			{ catalogCode: 'HOTSPOT_ROUTER', quantity: 1 },
			{ catalogCode: 'TRANSPORT_INSTALL', quantity: 1 },
		],
	},
	PRO_MAX: {
		code: 'PRO_MAX',
		name: 'Paquete Pro Enterprise — Control de Acceso como Servicio',
		planCode: 'PRO_MAX',
		items: [
			{ catalogCode: 'SCANNER_RENTAL', quantity: 6 },
			{ catalogCode: 'TABLET_RENTAL', quantity: 2 },
			{ catalogCode: 'BADGE_PRINTER_RENTAL', quantity: 1 },
			{ catalogCode: 'ONSITE_TECH', quantity: 3 },
			{ catalogCode: 'ACCESS_SUPERVISOR', quantity: 1 },
			{ catalogCode: 'INITIAL_SETUP', quantity: 1 },
			{ catalogCode: 'GATES_SETUP', quantity: 1 },
			{ catalogCode: 'DEDICATED_INTERNET', quantity: 1 },
			{ catalogCode: 'TRANSPORT_INSTALL', quantity: 1 },
			{ catalogCode: 'STAFF_TRAINING', quantity: 1 },
		],
	},
};

export function isAddOnServiceCode(value: string): value is AddOnServiceCode {
	return value in ADDON_SERVICES;
}

// Solo suma ítems FIXED — RANGE/QUOTE no tienen un precio de lista computable, quedan listados
// aparte para que el Super Admin los cotice a mano (ver service-requests.ts).
export function computeFixedTotalDOP(items: Array<{ catalogCode: AddOnServiceCode; quantity: number }>): number {
	return items.reduce((sum, item) => {
		const def = ADDON_SERVICES[item.catalogCode];
		if (def.pricingType !== 'FIXED' || def.unitPriceDOP == null) return sum;
		return sum + def.unitPriceDOP * item.quantity;
	}, 0);
}
