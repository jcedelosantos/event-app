// Catálogo de servicios adicionales (segunda línea de ingresos, fuera de la suscripción) — mismo
// criterio que plans.ts: es código, no una tabla editable desde la UI, porque cambia poco y así
// nunca hay que sincronizar precios entre una tabla y el resto del sistema. El frontend
// (src/app/modules/manager/service-requests/services/addon-catalog.ts) mantiene su PROPIA copia —
// este repo no es un monorepo con paths compartidos entre api/ y el Angular de arriba, así que no
// hay forma de importar este archivo desde ahí sin reestructurar el proyecto (mismo comentario que
// ya existe en plans.ts).
//
// Precios en dólares (USD), igual que los planes de suscripción — unificado en la revisión del
// tarifario comercial. Los nombres de campo (`unitPriceDOP`, `rangeMinDOP`/`rangeMaxDOP`,
// `computeFixedTotalDOP`, y la columna `ServiceRequestItem.unitPriceDOPSnapshot` en el schema)
// quedan igual por retrocompatibilidad — evita una migración de Postgres y no rompe el contrato de
// la API — pero desde este cambio los valores que cargan son montos en USD, no en RD$.

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
	| 'TRANSPORT_INSTALL'
	| 'SOUND_EQUIPMENT_RENTAL'
	| 'SCREEN_RENTAL'
	| 'CCTV_SERVICE'
	| 'CATERING_SERVICE';

export type AddOnServiceCategory = 'EQUIPO' | 'PERSONAL' | 'CONFIGURACION_SOPORTE' | 'CONECTIVIDAD' | 'COMUNICACION' | 'PERSONALIZACION' | 'PRODUCCION_EVENTO';

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
	SCANNER_RENTAL: { code: 'SCANNER_RENTAL', name: 'Renta de scanner/handheld', category: 'EQUIPO', modality: 'Por equipo/evento', pricingType: 'FIXED', unitPriceDOP: 35 },
	TABLET_RENTAL: { code: 'TABLET_RENTAL', name: 'Renta de tablet para check-in', category: 'EQUIPO', modality: 'Por equipo/evento', pricingType: 'FIXED', unitPriceDOP: 35 },
	BADGE_PRINTER_RENTAL: { code: 'BADGE_PRINTER_RENTAL', name: 'Renta de impresora de credenciales', category: 'EQUIPO', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 85 },
	BADGE_PRINTING: { code: 'BADGE_PRINTING', name: 'Impresión de gafetes/credenciales', category: 'EQUIPO', modality: 'Por unidad', pricingType: 'FIXED', unitPriceDOP: 0.5 },
	ONSITE_TECH: { code: 'ONSITE_TECH', name: 'Personal técnico presencial', category: 'PERSONAL', modality: 'Por técnico/jornada', pricingType: 'FIXED', unitPriceDOP: 85 },
	CHECKIN_STAFF: { code: 'CHECKIN_STAFF', name: 'Personal de check-in', category: 'PERSONAL', modality: 'Por persona/jornada', pricingType: 'FIXED', unitPriceDOP: 60 },
	ACCESS_SUPERVISOR: { code: 'ACCESS_SUPERVISOR', name: 'Supervisor de acceso', category: 'PERSONAL', modality: 'Por jornada', pricingType: 'FIXED', unitPriceDOP: 120 },
	INITIAL_SETUP: { code: 'INITIAL_SETUP', name: 'Configuración inicial del evento', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 70 },
	GATES_SETUP: { code: 'GATES_SETUP', name: 'Configuración de puertas y scanners', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 45 },
	REMOTE_SUPPORT: { code: 'REMOTE_SUPPORT', name: 'Soporte técnico remoto', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 60 },
	EMERGENCY_ONSITE_SUPPORT: { code: 'EMERGENCY_ONSITE_SUPPORT', name: 'Soporte técnico presencial de emergencia', category: 'CONFIGURACION_SOPORTE', modality: 'Por visita', pricingType: 'FIXED', unitPriceDOP: 105 },
	DEDICATED_INTERNET: { code: 'DEDICATED_INTERNET', name: 'Internet dedicado/backup para check-in', category: 'CONECTIVIDAD', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 175 },
	HOTSPOT_ROUTER: { code: 'HOTSPOT_ROUTER', name: 'Router/Hotspot 4G/5G', category: 'CONECTIVIDAD', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 60 },
	WHATSAPP_INVITES: {
		code: 'WHATSAPP_INVITES',
		name: 'Envío de invitaciones por WhatsApp',
		category: 'COMUNICACION',
		modality: 'Por volumen',
		pricingType: 'QUOTE',
		note: 'Desde $60 según cantidad',
	},
	SMS_INVITES: { code: 'SMS_INVITES', name: 'Envío de SMS', category: 'COMUNICACION', modality: 'Por mensaje/paquete', pricingType: 'QUOTE', note: 'Desde $45 según proveedor' },
	EMAIL_CAMPAIGN: { code: 'EMAIL_CAMPAIGN', name: 'Campaña de correo electrónico', category: 'COMUNICACION', modality: 'Por volumen', pricingType: 'FIXED', unitPriceDOP: 25 },
	QR_CUSTOM_DESIGN: { code: 'QR_CUSTOM_DESIGN', name: 'Diseño/personalización de QR', category: 'PERSONALIZACION', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 35 },
	CUSTOM_EVENT_PORTAL: { code: 'CUSTOM_EVENT_PORTAL', name: 'Portal del evento personalizado', category: 'PERSONALIZACION', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 80 },
	// No confundir con el dominio propio (Tenant.customDomain, ver api/src/app.ts) — ese ya viene
	// incluido en el plan Enterprise (PRO_MAX), no es un addon. Este ítem es branding visual básico
	// (logo/color) para tenants de un plan menor que igual lo quieren — el logo en sí ya es gratis
	// desde Configuración, esto es para trabajo de diseño/ajuste manual a pedido.
	WHITE_LABEL: { code: 'WHITE_LABEL', name: 'Branding visual a medida (logo/color)', category: 'PERSONALIZACION', modality: 'Mensual o evento', pricingType: 'FIXED', unitPriceDOP: 85 },
	GUEST_LIST_IMPORT: { code: 'GUEST_LIST_IMPORT', name: 'Importación/depuración de invitados', category: 'CONFIGURACION_SOPORTE', modality: 'Por base de datos', pricingType: 'FIXED', unitPriceDOP: 45 },
	POST_EVENT_REPORT: {
		code: 'POST_EVENT_REPORT',
		name: 'Reporte personalizado post-evento',
		category: 'PERSONALIZACION',
		modality: 'Por reporte',
		pricingType: 'RANGE',
		rangeMinDOP: 35,
		rangeMaxDOP: 85,
	},
	SPECIAL_INTEGRATION: { code: 'SPECIAL_INTEGRATION', name: 'Integraciones especiales/API', category: 'CONFIGURACION_SOPORTE', modality: 'Por proyecto', pricingType: 'QUOTE' },
	STAFF_TRAINING: { code: 'STAFF_TRAINING', name: 'Capacitación al personal del cliente', category: 'PERSONAL', modality: 'Por sesión', pricingType: 'FIXED', unitPriceDOP: 130 },
	TRANSPORT_INSTALL: { code: 'TRANSPORT_INSTALL', name: 'Transporte e instalación de equipos', category: 'CONFIGURACION_SOPORTE', modality: 'Por evento', pricingType: 'FIXED', unitPriceDOP: 45 },
	// Servicios de producción del evento en sí (no de control de acceso/check-in) — se coordinan con
	// proveedores externos según el evento, por eso son QUOTE sin precio de lista, a diferencia del
	// resto del catálogo que sí lo tiene.
	SOUND_EQUIPMENT_RENTAL: { code: 'SOUND_EQUIPMENT_RENTAL', name: 'Renta de equipo de sonido', category: 'PRODUCCION_EVENTO', modality: 'Por evento', pricingType: 'QUOTE', note: 'Según tamaño del evento y equipo requerido' },
	SCREEN_RENTAL: { code: 'SCREEN_RENTAL', name: 'Renta de pantallas', category: 'PRODUCCION_EVENTO', modality: 'Por evento', pricingType: 'QUOTE', note: 'Según cantidad y tamaño de pantallas' },
	CCTV_SERVICE: { code: 'CCTV_SERVICE', name: 'Servicio de circuito cerrado (CCTV)', category: 'PRODUCCION_EVENTO', modality: 'Por evento', pricingType: 'QUOTE', note: 'Según cantidad de cámaras y cobertura del venue' },
	CATERING_SERVICE: { code: 'CATERING_SERVICE', name: 'Servicio de catering', category: 'PRODUCCION_EVENTO', modality: 'Por evento', pricingType: 'QUOTE', note: 'Según cantidad de asistentes y menú' },
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
