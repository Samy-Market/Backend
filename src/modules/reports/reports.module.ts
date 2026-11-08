import { Module } from '@nestjs/common';
import { SchedulesModule } from '../schedules/schedules.module';
import { SitesModule } from '../sites/sites.module';
import { ReportExporter } from './application/ports/report-exporter';
import { ReportSource } from './application/ports/report-source';
import { ReportsService } from './application/reports.service';
import { ExcelReportExporter } from './infrastructure/excel/excel-report-exporter';
import { ReportsController } from './infrastructure/http/reports.controller';
import { PrismaReportSource } from './infrastructure/persistence/prisma-report-source';

@Module({
  imports: [SchedulesModule, SitesModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    { provide: ReportSource, useClass: PrismaReportSource },
    { provide: ReportExporter, useClass: ExcelReportExporter },
  ],
})
export class ReportsModule {}
