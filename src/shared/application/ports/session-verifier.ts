import { AuthUser } from '../../domain/auth-user';

export abstract class SessionVerifier {
  abstract verify(token: string): Promise<AuthUser | null>;
}
