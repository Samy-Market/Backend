import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { loginThrottleRules } from '../../config/app.config';
import { SessionVerifier } from '../../shared/application/ports/session-verifier';
import { AuthService } from './application/auth.service';
import { AccountRepository } from './application/ports/account.repository';
import { TokenService } from './application/ports/token-service';
import { PasswordResetService } from './application/password-reset.service';
import { ResetTokens } from './application/ports/reset-tokens';
import { SetupService } from './application/setup.service';
import { LoginThrottle } from './domain/login-throttle';
import { AuthController } from './infrastructure/http/auth.controller';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository';
import { CryptoResetTokens } from './infrastructure/security/crypto-reset-tokens';
import { JwtTokenService } from './infrastructure/security/jwt-token.service';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';

/** Global porque el canal en vivo (infraestructura compartida) necesita validar sesiones. */
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') as JwtSignOptions['expiresIn'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SetupService,
    PasswordResetService,
    { provide: ResetTokens, useClass: CryptoResetTokens },
    JwtStrategy,
    { provide: LoginThrottle, useFactory: () => new LoginThrottle(loginThrottleRules()) },
    { provide: SessionVerifier, useExisting: AuthService },
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: TokenService, useClass: JwtTokenService },
  ],
  exports: [SessionVerifier],
})
export class AuthModule {}
