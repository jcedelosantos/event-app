import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Ticket } from '../../../../models/tickets/ticket';
import { faker } from '@faker-js/faker';

@Injectable({
  providedIn: 'root'
})
export class TicketsService {
  private readonly httpClient = inject(HttpClient);

  mockTickets() {
    return {
      id: faker.number.int({ min: 1, max: 100 }),
      img: faker.image.urlPicsumPhotos(),
      code: faker.string.uuid(),
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      type: faker.helpers.arrayElement(['Normal', 'VIP']),
      count: faker.number.int({ min: 1, max: 100 }),
      active: faker.helpers.arrayElement([true, false]),
      price: Number(faker.commerce.price()),
      date: faker.date.anytime().toString(),
    } as Ticket;
  }

  getTickets(): Ticket[] {
    return faker.helpers.multiple(() => this.mockTickets(), { count: 10 });
  }
}
