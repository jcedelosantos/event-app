import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { User } from '../../../../models/users/user';
import { environment } from '../../../../../environments/environment';

export type UserTypeCode = 'ROOT' | 'USER' | 'CLIENT' | 'SCANNER';

export type UserInput = {
	username: string;
	password?: string;
	name: string;
	lastname: string;
	gender: string;
	email: string;
	carnet: string;
	adress: string;
	phone: string;
	userType: UserTypeCode;
	// Solo tiene efecto (y se exige del lado de la API) cuando userType === 'SCANNER' — ver
	// User.scannerEventId en la API.
	scannerEventId?: number | null;
	// Opcional incluso para SCANNER — ver User.accessPointId en la API.
	accessPointId?: number | null;
	// Restringe a este usuario (cualquier rol) a una sede — ver User.locationId en la API.
	locationId?: number | null;
};

@Injectable({
	providedIn: 'root',
})
export class UserService {
	private readonly httpClient = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/users`;

	getUsers(): Observable<User[]> {
		return this.httpClient.get<User[]>(this.baseUrl);
	}

	createUser(user: UserInput): Observable<User> {
		return this.httpClient.post<User>(this.baseUrl, user);
	}

	updateUser(id: number, user: Partial<UserInput>): Observable<User> {
		return this.httpClient.put<User>(`${this.baseUrl}/${id}`, user);
	}

	deleteUser(id: number): Observable<void> {
		return this.httpClient.delete<void>(`${this.baseUrl}/${id}`);
	}
}
