import { AttendanceReport } from '../../domain/attendance-report';

/** Convierte el reporte en un archivo descargable. */
export abstract class ReportExporter {
  abstract readonly contentType: string;
  abstract readonly extension: string;
  abstract export(report: AttendanceReport): Promise<Buffer>;
}
