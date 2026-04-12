import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Employee } from '../database/entites/mployee.entity';
import { TwoFactorAuth } from '../database/entites/twoFactorAuth.entity';
import { Store } from '../database/entites/store.entity';
import { SecurityAction } from '../database/entites/securityAction.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([Employee, TwoFactorAuth, Store, SecurityAction]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}