import { IsString, IsEmail, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Role } from "../../common/enum/auth.enum";

export class CreateUserDto {

    @IsOptional()        // 👈 makes this field optional
    @IsString()
    username?: string;    // 👈 question mark also marks optional

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsEnum(Role)
    role: Role = Role.STUDENT;
}