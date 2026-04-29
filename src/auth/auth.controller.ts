import {
  Controller,
  Post,
  Body,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from '../employees/dto/verify.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-register')
  verifyRegister(@Body() dto: VerifyDto) {
    return this.authService.verifyRegister(dto);
  }


  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable-2fa')
  enableTwoFactor(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.enableTwoFactor(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify-2fa-setup')
  verifyTwoFactorSetup(
    @CurrentUser() user: { id: string; email: string },
    @Body() dto: VerifyTwoFactorDto,
  ) {
    return this.authService.verifyTwoFactorSetup(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disable-2fa')
  disableTwoFactor(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.disableTwoFactor(user.id);
  }
}
