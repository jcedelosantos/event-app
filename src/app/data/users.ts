import { User } from "../models/users/user";
import { UserType } from "../models/users/user-type";

const userTypeAdmin: UserType = {
    id: 1,
    name: "Admin",
    description: "Adminitrator",
    type: "ROOT",
    license: ["*"],

}

const userTypeUser: UserType = {
    id: 2,
    name: "User",
    description: "User",
    type: "USER",
    license: ["SALE", "MAP"],

}

const userTypeClient: UserType = {
    id: 3,
    name: "Client",
    description: "Client",
    type: "CLIENT",
    license: ["BUY"],

}

export const userTypeList: Array<UserType> = [
    userTypeAdmin,
    userTypeUser,
    userTypeClient
]

export const Users: Array<User> = [
    {
        id: 1,
        username: "Admin",
        password: "1234",
        type: userTypeAdmin,
        name: "Miguel",
        lastname: "Pena",
        gender: "M",
        email: "miguel@gmail.com",
        carnet: 12345678,
        adress: "SD",
        phone: 80912345678
    },
    {
        id: 2,
        username: "User",
        password: "1234",
        type: userTypeUser,
        name: "Luis",
        lastname: "Pena",
        gender: "M",
        email: "luisl@gmail.com",
        carnet: 12341234,
        adress: "SD",
        phone: 8091231234
    },
    {
        id: 3,
        username: "Client",
        password: "1234",
        type: userTypeClient,
        name: "Javis",
        lastname: "*",
        gender: "M",
        email: "javis@gmail.com",
        carnet: 12345678,
        adress: "SD",
        phone: 80987654321
    },
    {
        id: 4,
        username: "Maria",
        password: "1234",
        type: userTypeClient,
        name: "Maria",
        lastname: "*",
        gender: "F",
        email: "Maria@gmail.com",
        carnet: 1233214,
        adress: "SD",
        phone: 80912324324
    },
    {
        id: 5,
        username: "Michael",
        password: "1234",
        type: userTypeClient,
        name: "Michael",
        lastname: "Rodriguez",
        gender: "M",
        email: "michael@gmail.com",
        carnet: 12345328,
        adress: "SD",
        phone: 809123543678
    },
]

