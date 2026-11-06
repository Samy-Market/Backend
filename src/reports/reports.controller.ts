import { Controller, Get, Query, Res } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { ReportQueryDto } from './dto';
import { buildAttendanceWorkbook } from './excel';
import { ReportsService } from './reports.service';

@Roles(Role.ADMIN, Role.SUPERVISOR)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('attendance')
  attendance(@Query() q: ReportQueryDto) {
    return this.reports.attendance(q);
  }

  @Get('attendance/export')
  async export(@Query() q: ReportQueryDto, @Res() res: Response) {
    const report = await this.reports.attendance(q);
    const buffer = await buildAttendanceWorkbook(report);
    const suffix = q.employeeId && report.employees[0] ? `_${slug(report.employees[0].employee.fullName)}` : '';
    const filename = `asistencia_${report.from}_a_${report.to}${suffix}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'no-store',
    });
    res.end(buffer);
  }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
