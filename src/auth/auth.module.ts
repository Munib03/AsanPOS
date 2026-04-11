import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Employee } from '../database/entites/mployee.entity';
import { Store } from '../database/entites/store.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';

@Module({
  imports: [MikroOrmModule.forFeature([Employee, TwoFactorAuth, Store])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}