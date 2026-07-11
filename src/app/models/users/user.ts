import { UserType } from './user-type';

export interface User {
	id: number;
	username: string;
	// La API nunca devuelve el hash; solo se envía al crear/actualizar.
	password?: string;
	type: UserType;
	name: string;
	lastname: string;
	gender: string;
	email: string;
	carnet: string;
	adress: string;
	phone: string | number;
}
