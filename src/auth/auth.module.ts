import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from '../shared/jwt/jwt.strategy';
import { QueueModule } from '../queue/queue.module';
import Redis from 'ioredis';

@Module({
  imports: [
    PassportModule,
    ConfigModule,
    QueueModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL')!),
      inject: [ConfigService],
    },
  ],
})
export class AuthModule { }