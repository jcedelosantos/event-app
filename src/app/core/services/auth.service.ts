import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../../models/users/user';

const TOKEN_KEY = 'seat-app-token';
// Guarda el token del Super Admin mientras "entra como" una organización, para poder volver a su
// sesión sin pedirle credenciales de nuevo — ver beginImpersonation/endImpersonation.
const IMPERSONATION_TOKEN_KEY = 'seat-app-impersonation-origin-token';

type LoginResponse = {
	token: string;
	user: User;
};

export type UpdateMeInput = {
	username?: string;
	currentPassword?: string;
	newPassword?: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
	private readonly httpClient = inject(HttpClient);

	currentUser = signal<User | null>(null);
	isImpersonating = signal<boolean>(typeof localStorage !== 'undefined' && localStorage.getItem(IMPERSONATION_TOKEN_KEY) !== null);

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
			tap(({ token, user }) => this.adoptSession(token, user)),
		);
	}

	updateMe(input: UpdateMeInput): Observable<User> {
		return this.httpClient.put<User>(`${environment.apiUrl}/auth/me`, input).pipe(tap((user) => this.currentUser.set(user)));
	}

	logout() {
		localStorage.removeItem(TOKEN_KEY);
		localStorage.removeItem(IMPERSONATION_TOKEN_KEY);
		this.currentUser.set(null);
		this.isImpersonating.set(false);
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

	// El Super Admin "entra como" el admin de una organización sin volver a loguearse — se guarda
	// su propio token para poder restaurarlo después con endImpersonation().
	beginImpersonation(token: string, user: User) {
		const currentToken = this.getToken();
		if (currentToken) {
			localStorage.setItem(IMPERSONATION_TOKEN_KEY, currentToken);
			this.isImpersonating.set(true);
		}
		this.adoptSession(token, user);
	}

	// Devuelve un Observable en vez de resolverlo acá adentro para que quien llame pueda esperar a
	// que currentUser ya esté actualizado antes de navegar (ej. de vuelta a /super-admin).
	endImpersonation(): Observable<User> | null {
		const originalToken = localStorage.getItem(IMPERSONATION_TOKEN_KEY);
		if (!originalToken) return null;
		localStorage.removeItem(IMPERSONATION_TOKEN_KEY);
		localStorage.setItem(TOKEN_KEY, originalToken);
		this.isImpersonating.set(false);
		return this.httpClient.get<User>(`${environment.apiUrl}/auth/me`).pipe(tap((user) => this.currentUser.set(user)));
	}

	private adoptSession(token: string, user: User) {
		localStorage.setItem(TOKEN_KEY, token);
		this.currentUser.set(user);
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
