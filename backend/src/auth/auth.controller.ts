import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { config } from '../config';
import type { SessionUser } from './actor';
import { AuthService, SESSION_COOKIE, SESSION_TTL_SEC } from './auth.service';
import { AuthGuard, CurrentUser, RateLimit, RateLimitGuard } from './guards';

class LoginDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Vui lòng nhập mật khẩu' })
  @MaxLength(200)
  password: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Đăng nhập trang quản trị; phiên lưu trong cookie HttpOnly, Secure, SameSite=Strict. */
  @Post('login')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit('login', 10, 60)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { token, user } = await this.auth.login(dto.email, dto.password);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config().cookieSecure,
      sameSite: 'strict',
      path: '/api',
      maxAge: SESSION_TTL_SEC * 1000,
    });
    return { user: publicUser(user) };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/api', httpOnly: true, secure: config().cookieSecure, sameSite: 'strict' });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: SessionUser) {
    return { user: publicUser(user) };
  }
}

function publicUser(u: SessionUser) {
  return { id: u.sub, name: u.name, email: u.email, role: u.role, staffId: u.staffId };
}
