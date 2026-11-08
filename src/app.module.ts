import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthController } from './modules/health/health.controller';
import { JustificationsModule } from './modules/justifications/justifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { SitesModule } from './modules/sites/sites.module';
import { UsersModule } from './modules/users/users.module';
import { JwtAuthGuard } from './shared/http/guards/jwt-auth.guard';
import { RolesGuard } from './shared/http/guards/roles.guard';
import { InfrastructureModule } from './shared/infrastructure/infrastructure.module';

/** Raíz de la aplicación: une la infraestructura compartida con los módulos de negocio. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    InfrastructureModule,
    AuthModule,
    UsersModule,
    SitesModule,
    ShiftsModule,
    SchedulesModule,
    EmployeesModule,
    AttendanceModule,
    JustificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Todas las rutas requieren sesión salvo las marcadas con @Public(); luego se validan los roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
