import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: { name: string; email: string; phone: string; password: string; storeName: string }) {
    return this.authService.register(body);
  }

  @Post('verify-register')
  verifyRegister(@Body() body: { email: string; code: string }) {
    return this.authService.verifyRegister(body.email, body.code);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('verify-login')
  verifyLogin(@Body() body: { email: string; code: string }) {
    return this.authService.verifyLogin(body.email, body.code);
  }
} 