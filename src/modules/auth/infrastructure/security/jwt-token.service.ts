import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { TokenService } from '../../application/ports/token-service';

@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private jwt: JwtService) {
    super();
  }

  sign(user: AuthUser): Promise<string> {
    return this.jwt.signAsync(user);
  }

  async verify(token: string): Promise<AuthUser | null> {
    try {
      return await this.jwt.verifyAsync<AuthUser>(token);
    } catch {
      return null;
    }
  }
}
