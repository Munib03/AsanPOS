import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import Redis from 'ioredis';
import { getAuthTokenVersionKey } from '../utils/auth.utils';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'fallback_secret',
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    tokenVersion?: number;
  }) {
    const storedTokenVersion = await this.redis.get(
      getAuthTokenVersionKey(payload.sub),
    );
    const tokenVersion = Number.parseInt(storedTokenVersion ?? '0', 10) || 0;
    if ((payload.tokenVersion ?? 0) !== tokenVersion)
      throw new UnauthorizedException('Token is no longer valid');

    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
