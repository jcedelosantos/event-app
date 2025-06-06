import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Events } from '../../../../models/events/events';
import { faker } from '@faker-js/faker';

import { maps } from '../../../../data/map';
import { tickets} from '../../../../data/tickets';

@Injectable({
	providedIn: 'root',
})
export class EventsService {
	private readonly httpClient = inject(HttpClient);

	mockEvents() {
		return {
			id: faker.number.int({ min: 1, max: 100 }),
			userId: faker.number.int({ min: 1, max: 100 }),
			clientId: 0,
			name: faker.commerce.productName(),
			img: faker.image.urlPicsumPhotos(),
			code: faker.string.uuid(),
			type: faker.helpers.arrayElement(['Normal', 'VIP']),
			description: faker.commerce.productDescription(),
			dateSale: faker.date.anytime(),
			dateOn: faker.date.anytime(),
			dateOff: faker.date.anytime(),
			active: faker.helpers.arrayElement([true, false]),
			map: maps[0],
			areas: [maps[0].areas[0].id, maps[1].areas[0].id],
			tickets: tickets,
			catalogs: [],
		} as Events;
	}

	getEvents(): Events[] {
		return faker.helpers.multiple(() => this.mockEvents(), { count: 10 });
	}
}
