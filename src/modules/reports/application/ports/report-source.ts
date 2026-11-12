import { ReportEmployee, ReportMark } from '../../domain/attendance-report';

export abstract class ReportSource {
  abstract employeeExists(id: string): Promise<boolean>;
  abstract employees(filter: { employeeId?: string; from: Date; to: Date }): Promise<ReportEmployee[]>;
  abstract justifiedAbsences(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, Set<string>>>;
  abstract marks(employeeIds: string[], from: Date, to: Date): Promise<Map<string, ReportMark[]>>;
}
