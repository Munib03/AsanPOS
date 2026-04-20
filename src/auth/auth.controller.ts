import { Controller, Get, Post, Body, Delete, UseGuards, Put } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { VerifyTwoFactorDto } from './dto/verify-2fa.dto';
import { JwtAuthGuard } from '../shared/jwt/jwt-auth.guard';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-register')
  verifyRegister(@Body() dto: VerifyDto) {
    return this.authService.verifyRegister(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: { id: string; email: string }) {
    return this.authService.getMe(user.id);
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


  @UseGuards(JwtAuthGuard)
  @Post('verify-updated-email')
  verifyUpdatedEmail(@Body() dto: VerifyDto) {
    return this.authService.verifyUpdatedEmail(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('update-employee-info')
  updateEmployeeInfo(@CurrentUser() user, @Body() dto: UpdateEmployeeDto) {
    return this.authService.updateEmployeeInfo(user.id, dto);
  }
}