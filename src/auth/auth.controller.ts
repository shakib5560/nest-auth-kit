import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from "./dto/createUser.dto";
import { LoginUserDto } from "./dto/loginUser.dto";
import { AuthGuard } from "../common/guard/auth.guard";
import { Public } from '../common/decorator/public.decorator';
import { User } from "../common/decorator/user.decorator";
import { UserService } from "../user/user.service";
import type { JwtPayload } from "../../types/jwt-payload.type";
import * as express from 'express';

@UseGuards(AuthGuard) // ✅ Apply guard to all routes
@Controller('auth')
export class AuthController {

    constructor(
        private authService: AuthService,
        private readonly userService: UserService
    ) {}

    // Public route
    @Public()
    @Post('signup')
    async createUser(@Body() createUserDto: CreateUserDto) {
        return this.authService.create(createUserDto);
    }

    @Public()
    @Post('login')
    async loginUser(
        @Body() loginUserDto: LoginUserDto,
        @Res({ passthrough: true }) res: express.Response
    ) {
        const result = await this.authService.login(loginUserDto);
        const { access_token, refresh_token, ...userData } = result;

        res.cookie('access_token', access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 1000, // 1h
        });

        res.cookie('refresh_token', refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30d
        });

        return userData;
    }

    // Protected route
    @Get('me')
    async getProfile(@User() user: JwtPayload) {
        // TS knows `user.sub`, `user.email`, `user.role`
        return this.userService.getUserById(String(user.sub));
    }

    @Public()
    @Post('reset-password')
    async resetPassword(@Body() body: any) {
        return this.authService.resetPassword(body);
    }

    @Public()
    @Post('verify-email')
    async verifyEmail(@Body() body: any) {
        return this.authService.verifyEmail(body.email, body.otp);
    }

    @Public()
    @Post('forgot-password')
    async forgotPassword(@Body() body: any) {
        return this.authService.forgotPassword(body.email);
    }

    // Protected route (no @Public decorator)
    @Post('change-password')
    async changePassword(@User() user: JwtPayload, @Body() body: any) {
        return this.authService.changePassword(String(user.sub), body);
    }

    @Post('logout')
    async logout(@Req() request: express.Request, @User() user: JwtPayload) {
        const token = request['token']; // Retrieved from AuthGuard
        return this.authService.logout(String(user.sub), token);
    }

    @Public()
    @Post('refresh')
    async refresh(
        @Req() req: express.Request,
        @Res({ passthrough: true }) res: express.Response
    ) {
        const refreshToken = req.cookies?.refresh_token || req.body?.refresh_token; 
        const result = await this.authService.refreshTokens(refreshToken);
        const { access_token, refresh_token: new_refresh_token, ...userData } = result;

        res.cookie('access_token', access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 60 * 60 * 1000, // 1h
        });

        res.cookie('refresh_token', new_refresh_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30d
        });

        return userData;
    }
}