import { inject, Injectable } from '@angular/core';
import { faker } from '@faker-js/faker';
import { Area } from '../../../../models/maps/area';
import { Map } from '../../../../models/maps/map';
import { Ticket } from '../../../../models/tickets/ticket';
import { User } from '../../../../models/users/user';
import { EventsService } from '../../events/services/events.service';
import { mockUser } from '../../../../data/mock-users';
import { Events } from '../../../../models/events/events';

@Injectable({
  providedIn: 'root'
})
export class QRService {
  eventService = inject(EventsService);

  mockQRList() {
    const event = this.eventService.createRandomEvent();
    return {
      user: mockUser(),
      client: faker.company.name(),
      date: faker.date.past().toISOString(),
      events: event,
      map: event.map,
      seats: faker.number.int({ min: 1, max: 100 }),
      ticket: event.tickets[faker.number.int({ min: 0, max: event.tickets.length - 1 })],
      type: faker.helpers.arrayElement(['VIP', 'Regular', 'Student']),
      code: faker.string.alphanumeric(10),
      price: faker.commerce.price({ min: 10, max: 500, dec: 2, symbol: '$' })
    } as QR;

  }

  getQRs(): QR[] {
    return faker.helpers.multiple(() => this.mockQRList(), { count: 10 });
  }
}

export type QR = {
  user: User;
  client: string;
  date: string;
  events: Events;
  map: Map;
  area: Area;
  seats: number;
  ticket: Ticket;
  type: string;
  code: string;
  price: string;
}
