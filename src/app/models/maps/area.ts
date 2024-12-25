import { Seat } from "./seat";
import { Table} from "./table"

export interface Area {
    id: number;
    name: string;
    img: string;
    seats: Array<Seat>;
    tables: Array<Table>;
    type: string;
    x: number;
    y: number;
    radio: number;
    color: string;
    size: number;
    backGround: string;
    totalTables: number;
    totalSeats: number;
    totalcount: number;
} 