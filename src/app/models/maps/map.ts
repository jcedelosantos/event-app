import { Area } from "./area";

export interface Map  {
    id: number;
    name: string;
    img: string;
    areas: Array<Area>;
    type: string;
    x: number;
    y: number;
    radio: number;
    color: string;
    size: number;
    groundColo: string;
} 