import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { SessionVerifier } from '../../../shared/application/ports/session-verifier';
import { AuthUser } from '../../../shared/domain/auth-user';
import { NotFoundError, UnauthorizedError } from '../../../shared/domain/errors';
import { canSignIn, toAuthUser } from '../domain/account';
import { AccountRepository } from './ports/account.repository';
import { TokenService } from './ports/token-service';

/** Iniciar sesión y validar sesiones (HTTP y WebSocket). */
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
    const ok = account ? await this.hasher.verify(password, account.passwordHash) : false;
    if (!account || !ok) throw new UnauthorizedError('Correo o contraseña incorrectos.');
    if (!canSignIn(account)) throw new UnauthorizedError('Tu usuario está inactivo. Contacta a tu supervisor.');
    return this.issueSession(account.id);
  }

  /** Emite el token de sesión y el perfil de un usuario ya validado. */
  async issueSession(userId: string) {
    const user = await this.resolveActiveUser(userId);
    if (!user) throw new UnauthorizedError('Tu usuario está inactivo o no existe.');
    return { accessToken: await this.tokens.sign(user), user: await this.me(userId) };
  }

  /** La identidad del usuario si sigue activo; se consulta en cada petición para cortar el acceso de inmediato. */
  async resolveActiveUser(userId: string): Promise<AuthUser | null> {
    const account = await this.accounts.findById(userId);
    return account && canSignIn(account) ? toAuthUser(account) : null;
  }

  /** Valida un token (lo usa el canal en vivo). */
  async verify(token: string): Promise<AuthUser | null> {
    const payload = await this.tokens.verify(token);
    return payload ? this.resolveActiveUser(payload.sub) : null;
  }

  async me(userId: string) {
    const profile = await this.accounts.profile(userId);
    if (!profile) throw new NotFoundError('Usuario no encontrado.');
    return profile;
  }
}
