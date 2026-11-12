import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from './modules/audit/audit.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthController } from './modules/health/health.controller';
import { JustificationsModule } from './modules/justifications/justifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SitesModule } from './modules/sites/sites.module';
import { TimeOffModule } from './modules/time-off/time-off.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './shared/http/guards/jwt-auth.guard';
import { RolesGuard } from './shared/http/guards/roles.guard';
import { InfrastructureModule } from './shared/infrastructure/infrastructure.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    InfrastructureModule,
    AuthModule,
    UsersModule,
    SitesModule,
    TimeOffModule,
    ShiftsModule,
    SchedulesModule,
    EmployeesModule,
    AttendanceModule,
    JustificationsModule,
    ReportsModule,
    AuditModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
