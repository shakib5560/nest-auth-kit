import {Role} from "../enum/auth.enum";

export interface JwtPayload {
    sub: number;
    role: Role;
}