import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Employee } from '../entites/Employee';
import { TwoFactorAuth } from '../entites/TwoFactorAuth';

@Module({
  imports: [MikroOrmModule.forFeature([Employee, TwoFactorAuth])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}