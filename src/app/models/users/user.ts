import { UserType } from './user-type';

export interface User {
	id: number;
	username: string;
	password: string;
	type: UserType;
	name: string;
	lastname: string;
	gender: string;
	email: string;
	carnet: number;
	adress: string;
	phone: number;
}
