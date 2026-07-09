import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../../models/users/user';

const TOKEN_KEY = 'seat-app-token';

type LoginResponse = {
	token: string;
	user: User;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
	private readonly httpClient = inject(HttpClient);

	currentUser = signal<User | null>(null);

	login(username: string, password: string): Observable<LoginResponse> {
		return this.httpClient.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { username, password }).pipe(
			tap(({ token, user }) => {
				localStorage.setItem(TOKEN_KEY, token);
				this.currentUser.set(user);
			}),
		);
	}

	logout() {
		localStorage.removeItem(TOKEN_KEY);
		this.currentUser.set(null);
	}

	getToken(): string | null {
		return localStorage.getItem(TOKEN_KEY);
	}

	isAuthenticated(): boolean {
		return !!this.getToken();
	}
}
