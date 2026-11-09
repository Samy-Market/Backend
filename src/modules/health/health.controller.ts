import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../shared/http/decorators';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('La base de datos no responde.');
    }
  }
}
