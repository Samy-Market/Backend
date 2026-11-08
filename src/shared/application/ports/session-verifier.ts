import { AuthUser } from '../../domain/auth-user';

/** Valida un token de sesión y devuelve al usuario si sigue activo. Lo implementa el módulo de autenticación. */
export abstract class SessionVerifier {
  abstract verify(token: string): Promise<AuthUser | null>;
}
