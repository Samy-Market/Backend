import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser } from '../../../../shared/domain/auth-user';
import { CurrentUser, Public } from '../../../../shared/http/decorators';
import { AuthService } from '../../application/auth.service';
import { SetupService } from '../../application/setup.service';
import { LoginDto } from './login.dto';
import { SetupDto } from './setup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private auth: AuthService,
    private setupService: SetupService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
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

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }
}
