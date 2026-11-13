import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { JustificationStatus, ReviewDecision } from '../../domain/justification';

export interface JustificationRecord {
  id: string;
  attendanceId: string | null;
  date: string | null;
  employeeId: string;
  reason: string;
  status: JustificationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface JustificationDetail extends JustificationRecord {
  attendance: { id: string; type: 'IN' | 'OUT'; timestamp: Date; isLate: boolean; lateMinutes: number } | null;
  employee: { id: string; fullName: string; position: string };
  reviewer: { id: string; email: string } | null;
}

export interface Review {
  status: ReviewDecision;
  reviewNote: string | null;
  reviewedBy: string;
  reviewedAt: Date;
}

export abstract class JustificationRepository {
  abstract markOwner(attendanceId: string): Promise<string | null>;
  abstract hasPending(attendanceId: string): Promise<boolean>;
  abstract marksBetween(employeeId: string, from: Date, to: Date): Promise<number>;
  abstract openForDay(employeeId: string, date: string): Promise<JustificationStatus | null>;
  abstract create(
    data: { attendanceId: string; employeeId: string; reason: string } | { date: string; employeeId: string; reason: string },
  ): Promise<JustificationDetail>;
  abstract list(filter: { status?: JustificationStatus; employeeId?: string }): Promise<JustificationDetail[]>;
  abstract findById(id: string): Promise<JustificationRecord | null>;
  abstract markAndNext(
    attendanceId: string,
    tx?: TransactionContext,
  ): Promise<{
    mark: { type: 'IN' | 'OUT'; timestamp: Date; siteId: string | null; employeeId: string; isLate: boolean };
    next: { type: 'IN' | 'OUT'; timestamp: Date } | null;
    previous: { type: 'IN' | 'OUT'; timestamp: Date } | null;
  } | null>;
  abstract setCredit(attendanceId: string, at: Date, justificationId: string, tx: TransactionContext): Promise<void>;
  abstract changedMarks(justificationId: string, tx: TransactionContext): Promise<{ id: string; manual: boolean; justified: boolean }[]>;
  abstract undoMarks(justificationId: string, manualIds: string[], tx: TransactionContext): Promise<void>;
  abstract reopen(id: string, tx: TransactionContext): Promise<boolean>;
  abstract createManualMark(
    employeeId: string,
    mark: { type: 'IN' | 'OUT'; timestamp: Date; isLate?: boolean; lateMinutes?: number; preEntryMinutes?: number },
    siteId: string | null,
    justificationId: string,
    tx: TransactionContext,
  ): Promise<void>;
  abstract employeeSite(employeeId: string): Promise<string>;
  abstract reviewIfPending(id: string, review: Review, tx: TransactionContext): Promise<boolean>;
  abstract detail(id: string, tx?: TransactionContext): Promise<JustificationDetail>;
}
