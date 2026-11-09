import { AuthUser } from '../../../../shared/domain/auth-user';

export abstract class TokenService {
  abstract sign(user: AuthUser): Promise<string>;
  abstract verify(token: string): Promise<AuthUser | null>;
}
