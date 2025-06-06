import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { faker } from '@faker-js/faker';
import { Events } from '../../../../models/events/event';

@Injectable({
  providedIn: 'root'
})
export class EventsService {
  private readonly httpClient = inject(HttpClient);

  createRandomEvent() {
    return {
      id: faker.number.int({ min: 1, max: 100 }),
      userId: faker.number.int({ min: 1, max: 100 }),
      clientId: faker.number.int({ min: 1, max: 100 }),
      name: faker.music.songName(),
      img: faker.image.urlPicsumPhotos(),
      code: faker.string.uuid(),
      type: faker.helpers.arrayElement(['Normal', 'VIP']),
      description: faker.commerce.productDescription(),
      dateSale: faker.date.anytime(),
      dateOn: faker.date.anytime(),
      dateOff: faker.date.anytime(),
      active: faker.helpers.arrayElement([true, false]),
      map: {
        id: faker.number.int({ min: 1, max: 100 }),
        name: faker.location.city(),
        img: faker.image.urlPicsumPhotos(),
      },
      areas: faker.helpers.multiple(() => ({
        id: faker.number.int({ min: 1, max: 100 }),
        name: faker.location.street(),
        description: faker.commerce.productDescription(),
      }), { count: faker.number.int({ min: 1, max: 5 }) }),
      tickets: faker.helpers.multiple(() => ({
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
      }), { count: faker.number.int({ min: 1, max: 5 }) }),
      location: {
        latitude: faker.location.latitude(), 
        longitude: faker.location.longitude()
      },
      // catalogs: faker.helpers.multiple(() => ({
      //   id: faker.number.int({ min: 1, max: 100 }),
      //   name: faker.commerce.productName(),
      //   description: faker.commerce.productDescription(),
      //   price: Number(faker.commerce.price()),
      //   products: []
      // }), { count: faker.number.int({ min: 1, max: 5 }) })
    } as Events;
  }

}
