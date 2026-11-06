import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthUser } from '../common/types';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { SetupDto } from './setup.dto';
import { SetupService } from './setup.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private setupService: SetupService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** ¿Falta crear el primer administrador? */
  @Public()
  @Get('setup')
  setupStatus() {
    return this.setupService.status();
  }

  /** Crea el primer administrador (solo si aún no existe ninguno). */
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
