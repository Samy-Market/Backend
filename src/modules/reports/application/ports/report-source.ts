import { ReportEmployee, ReportMark } from '../../domain/attendance-report';

/** De dónde salen los datos del reporte. */
export abstract class ReportSource {
  abstract employeeExists(id: string): Promise<boolean>;
  /** Uno solo, o los activos + los inactivos con marcas en [from, to). Por nombre. */
  abstract employees(filter: { employeeId?: string; from: Date; to: Date }): Promise<ReportEmployee[]>;
  /** Marcas en [from, to) agrupadas por empleado, en orden cronológico. */
  abstract marks(employeeIds: string[], from: Date, to: Date): Promise<Map<string, ReportMark[]>>;
}
