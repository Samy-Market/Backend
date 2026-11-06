import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AttendanceModule } from './attendance/attendance.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { EmployeesModule } from './employees/employees.module';
import { HealthController } from './health/health.controller';
import { JustificationsModule } from './justifications/justifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ReportsModule } from './reports/reports.module';
import { ShiftsModule } from './shifts/shifts.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    PrismaModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    AttendanceModule,
    EmployeesModule,
    ShiftsModule,
    JustificationsModule,
    ReportsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [
    // Todas las rutas requieren JWT salvo las marcadas con @Public(); luego se validan roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
