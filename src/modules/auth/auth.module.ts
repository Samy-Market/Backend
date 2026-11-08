import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SessionVerifier } from '../../shared/application/ports/session-verifier';
import { AuthService } from './application/auth.service';
import { AccountRepository } from './application/ports/account.repository';
import { TokenService } from './application/ports/token-service';
import { SetupService } from './application/setup.service';
import { AuthController } from './infrastructure/http/auth.controller';
import { PrismaAccountRepository } from './infrastructure/persistence/prisma-account.repository';
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
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SetupService,
    JwtStrategy,
    { provide: SessionVerifier, useExisting: AuthService },
    { provide: AccountRepository, useClass: PrismaAccountRepository },
    { provide: TokenService, useClass: JwtTokenService },
  ],
  exports: [SessionVerifier],
})
export class AuthModule {}
