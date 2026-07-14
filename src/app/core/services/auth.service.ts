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

	constructor() {
		// currentUser solo vivía en memoria — cualquier recarga de página lo perdía aunque el token
		// siguiera siendo válido, y con eso desaparecían silenciosamente los chequeos de permiso
		// (ej. el botón de liberar asiento en QRs) hasta el próximo login manual. Al arrancar el
		// servicio, si hay token válido, se resuelve el usuario contra /auth/me una sola vez.
		if (this.isAuthenticated()) {
			this.httpClient.get<User>(`${environment.apiUrl}/auth/me`).subscribe({
				next: (user) => this.currentUser.set(user),
				error: () => this.logout(),
			});
		}
	}

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
		const token = this.getToken();
		if (!token) return false;

		const expiresAt = decodeJwtExpiry(token);
		if (expiresAt !== null && expiresAt <= Date.now()) {
			this.logout();
			return false;
		}
		return true;
	}
}

// Decodifica el payload del JWT en el cliente (sin verificar firma, solo para leer `exp` y evitar
// mandar requests con un token que ya sabemos vencido). La firma la valida siempre el servidor.
function decodeJwtExpiry(token: string): number | null {
	try {
		const payload = JSON.parse(atob(token.split('.')[1]));
		return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
	} catch {
		return null;
	}
}
