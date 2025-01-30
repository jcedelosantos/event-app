import { Map } from '../models/maps/map';
import { Area } from '../models/maps/area';
import { Seat } from '../models/maps/seat';
import { Table } from '../models/maps/table';

const seat_1: Seat = {
	id: 1,
	name: 'seat_1',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 300.11,
	y: 130.12,
	radio: 60,
	color: '#770000',
	size: 32,
};
const seat_2: Seat = {
	id: 2,
	name: 'seat_2',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 400.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_3: Seat = {
	id: 3,
	name: 'seat_3',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 500.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_4: Seat = {
	id: 4,
	name: 'seat_4',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 300.11,
	y: 200.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_5: Seat = {
	id: 5,
	name: 'seat_5',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 400.11,
	y: 200.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_6: Seat = {
	id: 6,
	name: 'seat_6',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 350.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_7: Seat = {
	id: 7,
	name: 'seat_7',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 350.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_8: Seat = {
	id: 1,
	name: 'seat_8',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 350.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_9: Seat = {
	id: 9,
	name: 'seat_9',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 350.11,
	y: 130.12,
	radio: 60,
	color: '#333333',
	size: 32,
};
const seat_10: Seat = {
	id: 10,
	name: 'seat_10',
	icon: 'bi-layout-sidebar-inset',
	type: '',
	x: 22.11,
	y: 13.12,
	radio: 60,
	color: '#ff00ffff',
	size: 12,
};

const table_1: Table = {
	id: 101,
	name: 'Table 1',
	icon: 'bi-tablet-landscape-fill',
	seats: [seat_1, seat_2, seat_3],
	type: 'NORMAL',
	x: 602.12,
	y: 103.12,
	radio: 0,
	color: '#ff00ffff',
	size: 12,
};

const table_2: Table = {
	id: 102,
	name: 'Table 2',
	icon: 'bi-tablet-landscape-fill',
	seats: [seat_4, seat_5, seat_6],
	type: 'VIP',
	x: 422.12,
	y: 433.12,
	radio: 0,
	color: '#ff00ff00',
	size: 2,
};

const table_3: Table = {
	id: 103,
	name: 'Table 3',
	icon: 'bi-tablet-landscape-fill',
	seats: [seat_7, seat_8],
	type: '',
	x: 600,
	y: 500,
	radio: 0,
	color: '#ff00ff00',
	size: 2,
};

const area_1: Area = {
	id: 111,
	name: 'Area 1',
	description: 'BARRIOS PRECARIOS. BARRIOS POPULARES- TIPO A. BARRIOS POPULARES-TIPO B. BARRIOS MEJORABLES. BARRIOS CONSOLIDADOS. Bo. Las Lilas. N. E. S.',
	img: 'assets/images/area.png',
	icon: 'bi-textarea-resize',
	seats: [seat_1, seat_2, seat_3, seat_4, seat_5],
	tables: [table_1, table_2],
	type: '',
	x: 600,
	y: 350,
	radio: 0,
	color: '#000000',
	size: 24,
	backGround: '#ffffff',
	totalTables: 2,
	totalSeats: 1,
	totalCount: 7,
};

const area_2: Area = {
	id: 112,
	name: 'Area 2',
	description: '',
	img: 'assets/images/area.png',
	icon: '',
	seats: [seat_10],
	tables: [table_3],
	type: '',
	x: 50,
	y: 50,
	radio: 0,
	color: '#00ff00ff',
	size: 14,
	backGround: '#ff00ff',
	totalTables: 1,
	totalSeats: 1,
	totalCount: 3,
};

const map_1: Map = {
	id: 1,
	name: 'Map 1',
	description: 'Santo Domingo Este',
	img: 'assets/images/Screenshot.png',
	areas: [area_1],
	type: '',
	x: 18.480230,
	y: -69.925790,
	radio: 0,
	color: '#00ff00ff',
	size: 14,
	backGround: '#00ff00ff',

	totalTables: 1,
	totalTablesSeat: 2,
	totalSeats: 3,
};

const map_2: Map = {
	id: 2,
	name: 'Map 2',
	description: 'Santo Domingo Oeste',
	img: 'assets/images/Screenshot.png',
	areas: [area_1, area_2],
	type: '',
	x: 18.4628068,
	y: -70.0412847,
	radio: 0,
	color: '#f0f',
	size: 14,
	backGround: '#ff0',

	totalTables: 2,
	totalTablesSeat: 4,
	totalSeats: 6,
};

export const maps: Array<Map> = [map_1, map_2, map_1, map_2, map_1, map_2, map_1, map_2];
