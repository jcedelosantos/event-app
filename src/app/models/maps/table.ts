import { Seat } from "./seat";

export interface Table {
    id: number;
    name: string;
    img: string;
    seats: Array<Seat>;
    type: string;
    x: number;
    y: number;
    radio: number;
    color: string;
    size: number;
    backGround: string;
}