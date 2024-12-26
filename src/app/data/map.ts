import { Map } from "../models/maps/map";
import { Area } from "../models/maps/area";
import { Seat } from "../models/maps/seat";
import { Table } from "../models/maps/table";

const seat_1: Seat = {
    id: 1,
    name: "seat_1",
    img: "",
    type: "",
    x: 12.11,
    y: 13.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_2: Seat = {
    id: 2,
    name: "seat_2",
    img: "",
    type: "",
    x: 72.11,
    y: 11.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_3: Seat = {
    id: 3,
    name: "seat_3",
    img: "",
    type: "",
    x: 42.11,
    y: 73.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_4: Seat = {
    id: 4,
    name: "seat_4",
    img: "",
    type: "",
    x: 62.11,
    y: 53.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_5: Seat = {
    id: 5,
    name: "seat_5",
    img: "",
    type: "",
    x: 72.11,
    y: 23.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_6: Seat = {
    id: 6,
    name: "seat_6",
    img: "",
    type: "",
    x: 32.11,
    y: 73.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_7: Seat = {
    id: 7,
    name: "seat_7",
    img: "",
    type: "",
    x: 72.11,
    y: 13.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_8: Seat = {
    id: 1,
    name: "seat_8",
    img: "",
    type: "",
    x: 52.11,
    y: 43.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_9: Seat = {
    id: 9,
    name: "seat_9",
    img: "",
    type: "",
    x: 12.11,
    y: 23.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}
const seat_10: Seat = {
    id: 10,
    name: "seat_10",
    img: "",
    type: "",
    x: 22.11,
    y: 13.12,
    radio: 60,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}

const table_1: Table = {
    id: 101,
    name: "Table 1",
    img: "",
    seats: [
        seat_1,
        seat_2,
        seat_3
    ],
    type: "NORMAL",
    x: 62.12,
    y: 13.12,
    radio: 0,
    color: "ff00ff00",
    size: 12,
    backGround: "00ff00ff"
}

const table_2: Table = {
    id: 102,
    name: "Table 2",
    img: "",
    seats: [
        seat_4,
        seat_5,
        seat_6
    ],
    type: "VIP",
    x: 12.12,
    y: 13.12,
    radio: 0,
    color: "ff00ff00",
    size: 2,
    backGround: "00ff00ff"
}

const table_3: Table = {
    id: 103,
    name: "Table 3",
    img: "",
    seats: [
        seat_7,
        seat_8,
    ],
    type: "",
    x: 42,
    y: 53,
    radio: 0,
    color: "ff00ff00",
    size: 2,
    backGround: "00ff00ff"
}

const area_1: Area = {
    id: 111,
    name: "Area 1",
    img: "",
    icon: "",
    seats: [
        seat_9,
    ],
    tables: [
        table_1,
        table_2
    ],
    type: "",
    x: 200,
    y: 100,
    radio: 0,
    color: "#000000",
    size: 24,
    backGround: "#ffffff",
    totalTables: 2,
    totalSeats: 1,
    totalcount: 7
}

const area_2: Area = {
    id: 112,
    name: "Area 2",
    img: "",
    icon: "",
    seats: [
        seat_10,
    ],
    tables: [
        table_3
    ],
    type: "",
    x: 50,
    y: 50,
    radio: 0,
    color: "#00ff00ff",
    size: 14,
    backGround: "#ff00ff",
    totalTables: 1,
    totalSeats: 1,
    totalcount: 3
}


 const map_1: Map = {
    id: 1,
    name: "Map 1",
    description: "Santo Domingo Este",
    img: "assets/images/Screenshot.png",
    areas: [
        area_1
    ],
    type: "",
    x: 18.5107175,
    y: -69.8401429,
    radio: 0,
    color: "#00ff00ff",
    size: 14,
    backGround: "#00ff00ff",
}

 const map_2: Map = {
    id: 2,
    name: "Map 2",
    description: "Santo Domingo Oeste",
    img: "assets/images/Screenshot.png",
    areas: [
        area_1,
        area_2
    ],
    type: "",
    x: 18.4628068,
    y: -70.0412847,
    radio: 0,
    color: "#f0f",
    size: 14,
    backGround: "#ff0",
}

export const maps: Array<Map> = [
    map_1,
    map_2,
];