export interface Product {
	id: number;
	img: string;
	code: string;
	name: string;
	description: string;
	type: string;
	variant: string;
	count: number;
	active: boolean;
	price: number;
	eventId: number;
	// Solo relevante en tenants CHURCH — ver models/events/events.ts.
	isMealOfTheDay: boolean;
}
