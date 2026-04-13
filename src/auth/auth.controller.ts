import { Controller, Post, Body, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  @Post('verify-login')
  verifyLogin(@Body() dto: VerifyDto) {
    return this.authService.verifyLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('enable-2fa')
  enableTwoFactor(@Body() body: { employeeId: string }) {
    return this.authService.enableTwoFactor(body.employeeId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('2fa-qr/:employeeId')
  regenerateQRCode(@Param('employeeId') employeeId: string) {
    return this.authService.regenerateQRCode(employeeId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('disable-2fa/:employeeId')
  disableTwoFactor(@Param('employeeId') employeeId: string) {
    return this.authService.disableTwoFactor(employeeId);
  }
}