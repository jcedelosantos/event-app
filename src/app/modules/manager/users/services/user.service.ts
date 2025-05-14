import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { faker } from '@faker-js/faker';
import { User } from '../../../../models/users/user';
import { UserType } from '../../../../models/users/user-type';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  httpClient = inject(HttpClient);

  constructor() { }

  generateUserType() {
    return {
      id: faker.number.int({ min: 1, max: 100 }),
      name: faker.person.firstName(),
      description: faker.lorem.sentence(),
      type: faker.helpers.arrayElement(['admin', 'user']),
      license: [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()]
    } as UserType;
  }

  createRamdomUser() {
    return {
      id: faker.number.int({ min: 1, max: 100 }),
      username: faker.internet.username(),
      password: faker.internet.password(),
      type: this.generateUserType(),
      name: faker.person.firstName(),
      lastname: faker.person.lastName(),
      gender: faker.person.gender(),
      email: faker.internet.email(),
      carnet: faker.number.int({ min: 1, max: 100 }),
      adress: faker.location.streetAddress(),
      phone: faker.phone.number({ style: 'international' }),
    } as User;
  }

  getUsers(): User[] {
    return faker.helpers.multiple(() => this.createRamdomUser(), { count: 10 });
  }

  createUser(user: User): Observable<User> {
    return this.httpClient.post<User>('', JSON.stringify(user));
  }

  updateUser(user: User): Observable<User> {
    return this.httpClient.put<User>(`/id=${user.id}`, JSON.stringify(user));
  }
}
