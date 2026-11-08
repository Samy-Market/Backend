import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '../../../../shared/domain/roles';
import { Roles } from '../../../../shared/http/decorators';
import { ReportExporter } from '../../application/ports/report-exporter';
import { ReportsService } from '../../application/reports.service';
import { ReportQueryDto } from './report.dto';

@Roles(Role.ADMIN, Role.SUPERVISOR)
@Controller('reports')
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private exporter: ReportExporter,
  ) {}

  @Get('attendance')
  attendance(@Query() q: ReportQueryDto) {
    return this.reports.attendance(q);
  }

  @Get('attendance/export')
  async export(@Query() q: ReportQueryDto, @Res() res: Response) {
    const report = await this.reports.attendance(q);
    const buffer = await this.exporter.export(report);
    const suffix = q.employeeId && report.employees[0] ? `_${slug(report.employees[0].employee.fullName)}` : '';
    const filename = `asistencia_${report.from}_a_${report.to}${suffix}.${this.exporter.extension}`;
    res.set({
      'Content-Type': this.exporter.contentType,
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }
}

/** "José Pérez" → "jose-perez" (para el nombre del archivo). */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
