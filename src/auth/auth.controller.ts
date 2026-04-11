import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    register(
        @Body() body: {
            email: string;
            name: string;
            phone: string;
            password: string;
        }
    ) {
        return this.authService.register(body);
    }
}