import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { AuthService } from '../../application/auth.service';

/** Lee el token "Bearer" de cada petición y lo revalida contra la base de datos. */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /** Desactivar a un usuario corta su acceso de inmediato, aunque su token siga vigente. */
  async validate(payload: AuthUser): Promise<AuthUser> {
    const user = await this.auth.resolveActiveUser(payload.sub);
    if (!user) throw new UnauthorizedException('Tu usuario está inactivo o no existe.');
    return user;
  }
}
