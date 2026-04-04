import {
    Injectable,
    BadRequestException,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException,
    HttpException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/createUser.dto';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/loginUser.dto';
import { OtpService } from './otp.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpPurpose, Role } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly otpService: OtpService,
        private readonly prisma: PrismaService,
    ) {}

    async create(createUserDto: CreateUserDto) {
        try {
            const { email, password, username } = createUserDto;

            if (!email || !password) {
                throw new BadRequestException('Email and password are required');
            }

            if (!this.isValidEmail(email)) {
                throw new BadRequestException('Invalid email format');
            }

            const normalizedUsername = username?.toLowerCase();

            const userResponse = await this.userService.createUser({
                ...createUserDto,
                username: normalizedUsername,
            });

            await this.otpService.generateAndSendOtp(userResponse.user.email, OtpPurpose.VERIFICATION);

            return {
                message: 'User created successfully. Please check your email for the verification OTP.',
                user: userResponse.user,
            };
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            console.error('Prisma Error:', error);
            throw new InternalServerErrorException('Something went wrong');
        }
    }

    async login(loginUserDto: LoginUserDto) {
        try {
            const userResponse = await this.userService.loginUser(loginUserDto);
            const user = userResponse.user;

            const tokens = await this.getTokens(user.id, user.role || Role.STUDENT);
            await this.updateRefreshToken(user.id, tokens.refresh_token);

            return {
                message: 'User login successfully',
                user: userResponse.user,
                ...tokens,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException('Something went wrong');
        }
    }

    async refreshTokens(refreshToken: string) {
        if (!refreshToken) {
            throw new BadRequestException('Refresh token is required');
        }

        try {
            const payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: process.env.JWT_SECRET,
            });

            const userId = String(payload.sub);
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user || !user.refreshToken) {
                throw new UnauthorizedException('Access Denied');
            }

            const refreshTokenMatches = await bcrypt.compare(
                refreshToken,
                user.refreshToken,
            );

            if (!refreshTokenMatches) {
                throw new UnauthorizedException('Access Denied');
            }

            const tokens = await this.getTokens(user.id, user.role || Role.STUDENT);
            await this.updateRefreshToken(user.id, tokens.refresh_token);

            return tokens;
        } catch (e) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    async verifyEmail(email: string, otp: string) {
        if (!email || !otp) {
            throw new BadRequestException('Email and OTP are required');
        }

        await this.otpService.verifyOtp(email, otp, OtpPurpose.VERIFICATION);

        await this.prisma.user.update({
            where: { email: email.toLowerCase() },
            data: { isVerified: true },
        });

        return { message: 'Email verified successfully' };
    }

    async forgotPassword(email: string) {
        if (!email) {
            throw new BadRequestException('Email is required');
        }

        const normalizedEmail = email.toLowerCase();
        const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) {
            return { message: 'If an account exists, a password reset email has been sent.' };
        }

        await this.otpService.generateAndSendOtp(normalizedEmail, OtpPurpose.RESET_PASSWORD);

        return { message: 'If an account exists, a password reset email has been sent.' };
    }

    async resetPassword(body: any) {
        const { email, otp, newPassword } = body;
        if (!email || !otp || !newPassword) {
            throw new BadRequestException('Email, OTP, and newPassword are required');
        }

        const normalizedEmail = email.toLowerCase();
        await this.otpService.verifyOtp(email, otp, OtpPurpose.RESET_PASSWORD);

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { email: normalizedEmail },
            data: { password: hashedPassword },
        });

        return { message: 'Password has been reset successfully' };
    }

    async changePassword(userId: string, body: any) {
        const { oldPassword, newPassword } = body;
        if (!oldPassword || !newPassword) {
            throw new BadRequestException('oldPassword and newPassword are required');
        }

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid old password');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword },
        });

        return { message: 'Password has been changed successfully' };
    }

    async logout(userId: string, token: string) {
        // Blacklist Access Token
        if (token) {
            await this.prisma.blacklistedToken.create({
                data: { token },
            }).catch(() => {}); // Ignore if already blacklisted
        }

        // Remove Refresh Token from User
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: null },
        });

        return { message: 'Logged out successfully' };
    }

    // ✅ Helper methods
    private async getTokens(userId: string, role: Role) {
        const [at, rt] = await Promise.all([
            this.jwtService.signAsync(
                { sub: userId, role },
                { secret: process.env.JWT_SECRET, expiresIn: '1h' },
            ),
            this.jwtService.signAsync(
                { sub: userId, role },
                { secret: process.env.JWT_SECRET, expiresIn: '30d' },
            ),
        ]);

        return {
            access_token: at,
            refresh_token: rt,
        };
    }

    private async updateRefreshToken(userId: string, refreshToken: string) {
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        await this.prisma.user.update({
            where: { id: userId },
            data: { refreshToken: hashedRefreshToken },
        });
    }

    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}