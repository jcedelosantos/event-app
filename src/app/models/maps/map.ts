import { Area } from "./area";

export interface Map  {
    id: number;
    name: string;
    description: string;
    img: string;
    areas: Array<Area>;
    type: string;
    x: number;
    y: number;
    radio: number;
    color: string;
    size: number;
    backGround: string;
} 