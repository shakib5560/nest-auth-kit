import {
    ConflictException,
    Injectable,
    UnauthorizedException,
    NotFoundException,
} from '@nestjs/common';
import { Role as PrismaRole, Prisma } from '@prisma/client';
import { CreateUserDto } from "../auth/dto/createUser.dto";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from "../auth/dto/loginUser.dto";
import {Role} from "../common/enum/auth.enum";

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) {}

    /* ====================================================
       CREATE USER
    ==================================================== */
    async createUser(createUserDto: CreateUserDto) {
        const { email, password, username, role } = createUserDto;

        try {
            const normalizedEmail = email.toLowerCase();
            const normalizedUsername = username?.toLowerCase();

            const hashedPassword = await bcrypt.hash(password, 10);

            const user = await this.prisma.user.create({
                data: {
                    email: normalizedEmail,
                    username: normalizedUsername,
                    password: hashedPassword,
                    role: role as PrismaRole,
                },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    role: true,
                },
            });

            if (createUserDto.role === Role.ADMIN) {
                await this.prisma.adminProfile.create({
                    data: { userId: user.id },
                });
            }

            if (createUserDto.role === Role.STUDENT) {
                await this.prisma.studentProfile.create({
                    data: { userId: user.id },
                });
            }

            if (createUserDto.role === Role.TEACHER) {
                await this.prisma.teacherProfile.create({
                    data: { userId: user.id },
                });
            }

            return {
                message: "User created successfully",
                user,
            };

        } catch (e) {
            if (
                e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === "P2002"
            ) {
                const target = e.meta?.target as string[];

                if (target?.includes("email")) {
                    throw new ConflictException("Email already exists");
                }

                if (target?.includes("username")) {
                    throw new ConflictException("Username already exists");
                }

                throw new ConflictException("Duplicate field error");
            }

            throw e;
        }
    }

    /* ====================================================
       LOGIN USER
    ==================================================== */
    async loginUser(loginUserDto: LoginUserDto) {
        const { email, username, password } = loginUserDto;

        if (!email && !username) {
            throw new UnauthorizedException('Email or Username is required');
        }

        const user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    email
                        ? { email: { equals: email.toLowerCase(), mode: 'insensitive' } }
                        : undefined,
                    username
                        ? { username: { equals: username.toLowerCase(), mode: 'insensitive' } }
                        : undefined,
                ].filter(Boolean) as any,
            },
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
        }

        // remove password safely
        const { password: _, ...safeUser } = user;

        return {
            message: "Login successful",
            user: safeUser,
        };
    }

    /* ====================================================
       GET USER BY ID
    ==================================================== */
    async getUserById(userId: any) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }
}