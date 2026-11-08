import { AuthUser } from '../../../../shared/domain/auth-user';

/** Firma y verifica los tokens de sesión. */
export abstract class TokenService {
  abstract sign(user: AuthUser): Promise<string>;
  /** El contenido del token, o null si es inválido o expiró. */
  abstract verify(token: string): Promise<AuthUser | null>;
}
