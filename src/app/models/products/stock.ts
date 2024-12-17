import { Catalog } from "./catalog";

export interface Stock {
    id: number;
    name: string;
    Catalogs: Array<Catalog>;
    description: string;
}  