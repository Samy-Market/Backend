import { Injectable, Logger } from '@nestjs/common';
import { appUrl, PASSWORD_RESET_MINUTES } from '../../../config/app.config';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { Mailer } from '../../../shared/application/ports/mailer';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { BusinessRuleError, TooManyRequestsError } from '../../../shared/domain/errors';
import { canSignIn } from '../domain/account';
import { LoginThrottle } from '../domain/login-throttle';
import { maskEmail, RESET_INVALID, ResetRequestLimiter, resetEmail, resetIsUsable } from '../domain/password-reset';
import { AccountRepository } from './ports/account.repository';
import { ResetTokens } from './ports/reset-tokens';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('Recuperar contraseña');
  private readonly limiter = new ResetRequestLimiter(3, 10, 60 * 60_000);

  constructor(
    private accounts: AccountRepository,
    private tokens: ResetTokens,
    private hasher: PasswordHasher,
    private mailer: Mailer,
    private clock: Clock,
    private audit: AuditLog,
    private throttle: LoginThrottle,
    private realtime: RealtimeNotifier,
  ) {}

  /** Responde igual exista o no el correo, para no revelar quién tiene cuenta. */
  async request(email: string, ip: string) {
    const now = this.clock.now();
    const allowed = this.limiter.allow(email, ip, now.getTime());
    if (!allowed.ip) throw new TooManyRequestsError('Demasiadas solicitudes desde esta conexión. Inténtalo en una hora.');
    if (!allowed.email) return { ok: true };

    const account = await this.accounts.findByEmail(email);
    if (!account || !canSignIn(account)) return { ok: true };

    const { token, hash } = this.tokens.generate();
    await this.accounts.createReset(account.id, hash, new Date(now.getTime() + PASSWORD_RESET_MINUTES * 60_000));
    const link = `${appUrl()}/restablecer?token=${token}`;
    try {
      await this.mailer.send({ to: account.email, ...resetEmail(link, PASSWORD_RESET_MINUTES) });
    } catch (err) {
      this.logger.error(`No se pudo enviar el correo de recuperación a ${maskEmail(account.email)}: ${String(err)}`);
    }
    return { ok: true };
  }

  async check(token: string) {
    const reset = await this.accounts.findReset(this.tokens.hash(token));
    if (!resetIsUsable(reset, this.clock.now())) return { valid: false };
    const account = await this.accounts.findById(reset.userId);
    if (!account || !canSignIn(account)) return { valid: false };
    return { valid: true, email: maskEmail(account.email) };
  }

  async reset(token: string, newPassword: string) {
    const now = this.clock.now();
    const reset = await this.accounts.findReset(this.tokens.hash(token));
    if (!resetIsUsable(reset, now)) throw new BusinessRuleError(RESET_INVALID);
    const account = await this.accounts.findById(reset.userId);
    if (!account || !canSignIn(account)) throw new BusinessRuleError(RESET_INVALID);

    const ok = await this.accounts.completeReset(reset.id, account.id, await this.hasher.hash(newPassword), now);
    if (!ok) throw new BusinessRuleError(RESET_INVALID);
    this.throttle.succeed(account.email);
    this.realtime.disconnectUser(account.id);
    await this.audit.record({ userId: account.id, action: 'PASSWORD_RESET', entity: 'User', entityId: account.id });
    return { ok: true };
  }
}
