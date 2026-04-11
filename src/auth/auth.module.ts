import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Employee } from '../entites/Employee';
import { TwoFactorAuth } from '../entites/TwoFactorAuth';

@Module({
  imports: [
    MikroOrmModule.forFeature([Employee, TwoFactorAuth]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule { }