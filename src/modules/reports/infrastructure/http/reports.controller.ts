import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DateTime } from 'luxon';
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
    const filename = `asistencia_${periodSlug(report.from, report.to)}${suffix}.${this.exporter.extension}`;
    res.set({
      'Content-Type': this.exporter.contentType,
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }
}

function periodSlug(from: string, to: string) {
  const f = DateTime.fromISO(from);
  const t = DateTime.fromISO(to);
  return f.day === 1 && t.hasSame(f, 'month') && t.day === f.daysInMonth ? from.slice(0, 7) : `${from}_a_${to}`;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
