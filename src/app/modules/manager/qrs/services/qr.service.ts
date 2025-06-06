import { inject, Injectable } from '@angular/core';
import { faker } from '@faker-js/faker';
import { UserService } from '../../users/services/user.service';
import { EventsService } from '../../events/services/events.service';
import { User } from '../../../../models/users/user';
import { Events } from '../../../../models/events/event';
import { Map } from '../../../../models/maps/map';
import { Area } from '../../../../models/maps/area';
import { Ticket } from '../../../../models/tickets/ticket';

@Injectable({
  providedIn: 'root'
})
export class QRService {
  userService = inject(UserService);
  eventService = inject(EventsService);

  mockQRList() {
    const event = this.eventService.createRandomEvent();
    return {
      user: this.userService.createRamdomUser(),
      client: faker.company.name(),
      date: faker.date.past().toISOString(),
      events: event,
      map: event.map,
      area: event.areas[faker.number.int({ min: 0, max: event.areas.length - 1 })],
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
