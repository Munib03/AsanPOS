import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Delete,
  Headers,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from '../employees/dto/verify.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from '../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NewPasswordDto } from './dto/new-password.dto';

const PASSWORD_RESET_COOKIE_NAME = 'password_reset_session';
const PASSWORD_RESET_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/auth/new-password',
};
const PASSWORD_RESET_COOKIE_MAX_AGE = 5 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-register')
  @HttpCode(HttpStatus.OK)
  verifyRegister(@Body() dto: VerifyDto) {
    return this.authService.verifyRegister(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { passwordResetSession, ...result } =
      await this.authService.verifyResetCode(dto);

    response.cookie(PASSWORD_RESET_COOKIE_NAME, passwordResetSession, {
      ...PASSWORD_RESET_COOKIE_OPTIONS,
      maxAge: PASSWORD_RESET_COOKIE_MAX_AGE,
    });

    return result;
  }

  @Post('new-password')
  @HttpCode(HttpStatus.OK)
  async newPassword(
    @Body() dto: NewPasswordDto,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const passwordResetSession = cookieHeader
      ?.split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${PASSWORD_RESET_COOKIE_NAME}=`))
      ?.slice(PASSWORD_RESET_COOKIE_NAME.length + 1);

    if (!passwordResetSession)
      throw new BadRequestException(
        'Password reset session is invalid or expired',
      );

    const result = await this.authService.setNewPassword(
      dto,
      passwordResetSession,
    );
    response.clearCookie(
      PASSWORD_RESET_COOKIE_NAME,
      PASSWORD_RESET_COOKIE_OPTIONS,
    );

    return result;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('enable-2fa')
  enableTwoFactor(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.enableTwoFactor(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('verify-2fa-setup')
  verifyTwoFactorSetup(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: VerifyTwoFactorDto,
  ) {
    return this.authService.verifyTwoFactorSetup(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Delete('disable-2fa')
  disableTwoFactor(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.disableTwoFactor(user.id);
  }
}
