import { Catalog } from "../models/products/catalog";
import { Product } from "../models/products/product";
import { Stock } from "../models/products/stock";

const product_1: Product = {
    id: 0,
    code:"123454",
    img:"",
    name:"agua",
    description:"planeta azul",
    dateCommit: new Date("24-10-2020"),
    type:"bedida",
    count:"1000",  
    active: true,
    price: 10,
 }

 const catalog_1: Catalog = {
    id: 0,
    name:"bebida y jugos",
    products: [
        product_1
    ],
    type:"bebida",
    description:"lista de bebidas",
 }

 export const stock_1: Stock = {
    id: 0,
    name:"cafeteria 1",
    Catalogs: [
        catalog_1
    ],
    description:"cafeteria",
 }