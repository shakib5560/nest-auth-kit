import {
    Injectable,
    BadRequestException,
    InternalServerErrorException,
    NotFoundException,
    UnauthorizedException
} from '@nestjs/common';
import { CreateUserDto } from './dto/createUser.dto';
import { UserService } from '../user/user.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { LoginUserDto } from './dto/loginUser.dto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpPurpose } from '@prisma/client';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly mailService: MailService,
        private readonly prisma: PrismaService,
    ) {}

    async create(createUserDto: CreateUserDto) {
        try {
            const { email, password, username } = createUserDto;

            // ✅ Proper validation
            if (!email || !password) {
                throw new BadRequestException('Email and password are required');
            }

            if (!this.isValidEmail(email)) {
                throw new BadRequestException('Invalid email format');
            }

            // ✅ Normalize username
            const normalizedUsername = username?.toLowerCase();

            // ✅ Create user
            const userResponse = await this.userService.createUser({
                ...createUserDto,
                username: normalizedUsername,
            });

            // ✅ Generate OTP and send email
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            await this.prisma.emailOtp.create({
                data: {
                    email: userResponse.user.email,
                    otp: otpCode,
                    purpose: OtpPurpose.VERIFICATION,
                    expiresAt,
                }
            });

            await this.mailService.sendVerificationOtp(userResponse.user.email, otpCode);

            return {
                message: 'User created successfully. Please check your email for the verification OTP.',
                user: userResponse.user,
            };
        } catch (error) {
            console.error('Prisma Error:', error);
            throw new InternalServerErrorException(
                error.message || 'Something went wrong',
            );
        }
    }

    async login(loginUserDto: LoginUserDto) {
        try {
            const userResponse = await this.userService.loginUser(loginUserDto);
            const user = userResponse.user;

            const tokens = await this.getTokens(user.id, user.role || 'STUDENT');
            await this.updateRefreshToken(user.id, tokens.refresh_token);

            return {
                message: 'User login successfully',
                user: userResponse.user,
                ...tokens,
            };
        } catch (error) {
            throw new InternalServerErrorException(
                error.message || 'Something went wrong',
            );
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

            const userId = Number(payload.sub);
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

            const tokens = await this.getTokens(user.id, user.role || 'STUDENT');
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

        const otpRecord = await this.prisma.emailOtp.findFirst({
            where: {
                email: email.toLowerCase(),
                otp,
                purpose: OtpPurpose.VERIFICATION,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!otpRecord) {
            throw new BadRequestException('Invalid OTP');
        }

        if (otpRecord.expiresAt < new Date()) {
            throw new BadRequestException('OTP has expired');
        }

        // OTP is valid, update user
        await this.prisma.user.update({
            where: { email: email.toLowerCase() },
            data: { isVerified: true },
        });

        // Optional: Delete all verification OTPs for this user
        await this.prisma.emailOtp.deleteMany({
            where: { email: email.toLowerCase(), purpose: OtpPurpose.VERIFICATION },
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

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await this.prisma.emailOtp.create({
            data: {
                email: normalizedEmail,
                otp: otpCode,
                purpose: OtpPurpose.RESET_PASSWORD,
                expiresAt,
            }
        });

        await this.mailService.sendPasswordResetOtp(normalizedEmail, otpCode);

        return { message: 'If an account exists, a password reset email has been sent.' };
    }

    async resetPassword(body: any) {
        const { email, otp, newPassword } = body;
        if (!email || !otp || !newPassword) {
            throw new BadRequestException('Email, OTP, and newPassword are required');
        }

        const normalizedEmail = email.toLowerCase();
        const otpRecord = await this.prisma.emailOtp.findFirst({
            where: {
                email: normalizedEmail,
                otp,
                purpose: OtpPurpose.RESET_PASSWORD,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!otpRecord || otpRecord.expiresAt < new Date()) {
            throw new BadRequestException('Invalid or expired OTP');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: { email: normalizedEmail },
            data: { password: hashedPassword },
        });

        await this.prisma.emailOtp.deleteMany({
            where: { email: normalizedEmail, purpose: OtpPurpose.RESET_PASSWORD },
        });

        return { message: 'Password has been reset successfully' };
    }

    async changePassword(userId: number, body: any) {
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

    async logout(userId: number, token: string) {
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
    private async getTokens(userId: number, role: string) {
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

    private async updateRefreshToken(userId: number, refreshToken: string) {
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