import { AttendanceReport } from '../../domain/attendance-report';

export abstract class ReportExporter {
  abstract readonly contentType: string;
  abstract readonly extension: string;
  abstract export(report: AttendanceReport): Promise<Buffer>;
}
