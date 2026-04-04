import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { OtpPurpose } from '@prisma/client';

@Injectable()
export class OtpService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
    ) {}

    // Generate and send OTP for verification or password reset
    async generateAndSendOtp(email: string, purpose: OtpPurpose) {
        const normalizedEmail = email.toLowerCase();
        
        // Generate random 6 digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash the OTP
        const hashedOtp = await bcrypt.hash(otpCode, 10);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

        await this.prisma.emailOtp.create({
            data: {
                email: normalizedEmail,
                otp: hashedOtp,
                purpose,
                expiresAt,
            }
        });

        if (purpose === OtpPurpose.VERIFICATION) {
            await this.mailService.sendVerificationOtp(normalizedEmail, otpCode);
        } else if (purpose === OtpPurpose.RESET_PASSWORD) {
            await this.mailService.sendPasswordResetOtp(normalizedEmail, otpCode);
        }
    }

    // Verify OTP based on email and purpose
    async verifyOtp(email: string, otp: string, purpose: OtpPurpose) {
        const normalizedEmail = email.toLowerCase();
        
        // Find the most recent OTP for this email and purpose
        const otpRecord = await this.prisma.emailOtp.findFirst({
            where: {
                email: normalizedEmail,
                purpose,
            },
            orderBy: { createdAt: 'desc' },
        });

        if (!otpRecord) {
            throw new BadRequestException('Invalid or expired OTP');
        }

        if (otpRecord.expiresAt < new Date()) {
            throw new BadRequestException('OTP has expired');
        }

        const isOtpValid = await bcrypt.compare(otp, otpRecord.otp);
        if (!isOtpValid) {
            throw new BadRequestException('Invalid OTP');
        }

        // Clean up: delete all OTPs for this user and purpose once verified
        await this.prisma.emailOtp.deleteMany({
            where: { email: normalizedEmail, purpose },
        });

        return true;
    }
}
