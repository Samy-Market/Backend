import { Injectable } from '@nestjs/common';
import { ReportExporter } from '../../application/ports/report-exporter';
import { AttendanceReport } from '../../domain/attendance-report';
import { buildAttendanceWorkbook } from './attendance-workbook';

@Injectable()
export class ExcelReportExporter extends ReportExporter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';

  export(report: AttendanceReport): Promise<Buffer> {
    return buildAttendanceWorkbook(report);
  }
}
