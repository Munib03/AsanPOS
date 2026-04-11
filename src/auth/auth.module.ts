import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Employee } from '../entites/Employee';
import { TwoFactorAuth } from '../entites/TwoFactorAuth';
import { Store } from '../entites/Store';

@Module({
  imports: [MikroOrmModule.forFeature([Employee, TwoFactorAuth, Store])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}