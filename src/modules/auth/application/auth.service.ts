import { Injectable } from '@nestjs/common';
import { sessionIdleMinutes } from '../../../config/app.config';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { SessionVerifier } from '../../../shared/application/ports/session-verifier';
import { AuthUser } from '../../../shared/domain/auth-user';
import { NotFoundError, UnauthorizedError } from '../../../shared/domain/errors';
import { canSignIn, toAuthUser } from '../domain/account';
import { AccountRepository } from './ports/account.repository';
import { TokenService } from './ports/token-service';

@Injectable()
export class AuthService extends SessionVerifier {
  constructor(
    private accounts: AccountRepository,
    private hasher: PasswordHasher,
    private tokens: TokenService,
  ) {
    super();
  }

  async login(email: string, password: string) {
    const account = await this.accounts.findByEmail(email);
    const ok = account ? await this.matches(password, account.passwordHash) : false;
    if (!account || !ok) throw new UnauthorizedError('Correo o contraseña incorrectos.');
    if (!canSignIn(account)) throw new UnauthorizedError('Tu usuario está inactivo. Contacta a tu supervisor.');
    return this.issueSession(account.id);
  }

  /**
   * Compara la contraseña tal cual y, si no coincide, sin los espacios de los extremos: al pegarla
   * desde un mensaje suele venir con un espacio o salto de línea que no se ve.
   */
  private async matches(password: string, hash: string): Promise<boolean> {
    if (await this.hasher.verify(password, hash)) return true;
    const trimmed = password.trim();
    return trimmed !== password && trimmed.length > 0 && this.hasher.verify(trimmed, hash);
  }

  async issueSession(userId: string) {
    const user = await this.resolveActiveUser(userId);
    if (!user) throw new UnauthorizedError('Tu usuario está inactivo o no existe.');
    return { accessToken: await this.tokens.sign(user), user: await this.me(userId) };
  }

  async resolveActiveUser(userId: string): Promise<AuthUser | null> {
    const account = await this.accounts.findById(userId);
    return account && canSignIn(account) ? toAuthUser(account) : null;
  }

  async verify(token: string): Promise<AuthUser | null> {
    const payload = await this.tokens.verify(token);
    return payload ? this.resolveActiveUser(payload.sub) : null;
  }

  async me(userId: string) {
    const profile = await this.accounts.profile(userId);
    if (!profile) throw new NotFoundError('Usuario no encontrado.');
    return { ...profile, session: { idleMinutes: sessionIdleMinutes(profile.role) } };
  }
}
