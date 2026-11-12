import { Injectable } from '@nestjs/common';
import { sessionIdleMinutes } from '../../../config/app.config';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { SessionVerifier } from '../../../shared/application/ports/session-verifier';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, NotFoundError, TooManyRequestsError, UnauthorizedError } from '../../../shared/domain/errors';
import { canSignIn, toAuthUser } from '../domain/account';
import { LoginThrottle } from '../domain/login-throttle';
import { sessionStillValid } from '../domain/password-reset';
import { AccountRepository } from './ports/account.repository';
import { TokenService } from './ports/token-service';

@Injectable()
export class AuthService extends SessionVerifier {
  constructor(
    private accounts: AccountRepository,
    private hasher: PasswordHasher,
    private tokens: TokenService,
    private throttle: LoginThrottle,
    private clock: Clock,
    private audit: AuditLog,
  ) {
    super();
  }

  async login(email: string, password: string, ip: string) {
    this.ensureNotLocked(email, ip);

    const account = await this.accounts.findByEmail(email);
    const ok = account ? await this.matches(password, account.passwordHash) : false;
    if (!account || !ok) {
      const left = this.throttle.fail(email, ip, this.clock.now().getTime());
      this.ensureNotLocked(email, ip);
      const hint = left <= 2 ? ` Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`} antes del bloqueo temporal.` : '';
      throw new UnauthorizedError(`Correo o contraseña incorrectos.${hint}`);
    }
    this.throttle.succeed(email);
    if (!canSignIn(account)) throw new UnauthorizedError('Tu usuario está inactivo. Contacta a tu supervisor.');
    return this.issueSession(account.id);
  }

  /** Responde 400 y no 401 si la actual es incorrecta: un 401 haría que la app cierre la sesión. */
  async changePassword(userId: string, current: string, next: string, ip: string) {
    const account = await this.accounts.findById(userId);
    if (!account || !canSignIn(account)) throw new UnauthorizedError('Tu usuario está inactivo o no existe.');
    this.ensureNotLocked(account.email, ip);
    if (!(await this.matches(current, account.passwordHash))) {
      const left = this.throttle.fail(account.email, ip, this.clock.now().getTime());
      this.ensureNotLocked(account.email, ip);
      const hint = left <= 2 ? ` Te ${left === 1 ? 'queda 1 intento' : `quedan ${left} intentos`} antes del bloqueo temporal.` : '';
      throw new BusinessRuleError(`La contraseña actual no es correcta.${hint}`);
    }
    if (await this.hasher.verify(next, account.passwordHash)) {
      throw new BusinessRuleError('La nueva contraseña debe ser distinta de la actual.');
    }
    await this.accounts.updatePassword(account.id, await this.hasher.hash(next), this.clock.now());
    await this.audit.record({ userId: account.id, action: 'CHANGE_PASSWORD', entity: 'User', entityId: account.id });
    // Se cierran las demás sesiones; esta sigue con un token nuevo.
    return { ok: true, accessToken: await this.tokens.sign(toAuthUser(account)) };
  }

  private ensureNotLocked(email: string, ip: string) {
    const verdict = this.throttle.check(email, ip, this.clock.now().getTime());
    if (!verdict.allowed) throw tooMany(verdict.retryInMinutes);
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

  async resolveActiveUser(userId: string, issuedAt?: number): Promise<AuthUser | null> {
    const account = await this.accounts.findById(userId);
    if (!account || !canSignIn(account) || !sessionStillValid(account.passwordChangedAt, issuedAt)) return null;
    return toAuthUser(account);
  }

  async verify(token: string): Promise<AuthUser | null> {
    const payload = await this.tokens.verify(token);
    return payload ? this.resolveActiveUser(payload.sub, payload.iat) : null;
  }

  async me(userId: string) {
    const profile = await this.accounts.profile(userId);
    if (!profile) throw new NotFoundError('Usuario no encontrado.');
    return { ...profile, session: { idleMinutes: sessionIdleMinutes(profile.role) } };
  }
}

function tooMany(minutes: number) {
  return new TooManyRequestsError(
    `Demasiados intentos fallidos. Espera ${minutes === 1 ? '1 minuto' : `${minutes} minutos`} e inténtalo de nuevo.`,
  );
}
