import { Seat } from "./seat";
import { Table} from "./table"

export interface Area {
    id: number;
    name: string;
    description: string;
    img: string;
    icon: string;
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
    totalCount: number;
} 