import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { CurrentUser, Public } from '../../../../shared/http/decorators';
import { AuthService } from '../../application/auth.service';
import { PasswordResetService } from '../../application/password-reset.service';
import { SetupService } from '../../application/setup.service';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, ResetPasswordDto, ResetTokenDto } from './login.dto';
import { SetupDto } from './setup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private setupService: SetupService,
    private resets: PasswordResetService,
  ) {}

  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.resets.request(dto.email, ip);
  }

  @Public()
  @Post('password/reset/check')
  @HttpCode(200)
  checkReset(@Body() dto: ResetTokenDto) {
    return this.resets.check(dto.token);
  }

  @Public()
  @Post('password/reset')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.resets.reset(dto.token, dto.newPassword);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto.email, dto.password, ip);
  }

  @Public()
  @Get('setup')
  setupStatus() {
    return this.setupService.status();
  }

  @Public()
  @Post('setup')
  setup(@Body() dto: SetupDto) {
    return this.setupService.setup(dto);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Ip() ip: string) {
    return this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword, ip);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
