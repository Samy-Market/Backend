import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Se revalida contra la BD para que desactivar un usuario corte su acceso de inmediato. */
  async validate(payload: AuthUser): Promise<AuthUser> {
    const user = await this.auth.resolveActiveUser(payload.sub);
    if (!user) throw new UnauthorizedException('Tu usuario está inactivo o no existe.');
    return user;
  }
}
