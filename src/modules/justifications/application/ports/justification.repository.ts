import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { JustificationStatus, ReviewDecision } from '../../domain/justification';

/** La justificación como se guarda. */
export interface JustificationRecord {
  id: string;
  attendanceId: string;
  employeeId: string;
  reason: string;
  status: JustificationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

/** Con la marcación, el empleado y quien la revisó (lo que muestran las pantallas). */
export interface JustificationDetail extends JustificationRecord {
  attendance: { id: string; type: 'IN' | 'OUT'; timestamp: Date; isLate: boolean; lateMinutes: number };
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
  /** Dueño de una marcación (para no justificar marcas ajenas). */
  abstract markOwner(attendanceId: string): Promise<string | null>;
  abstract hasPending(attendanceId: string): Promise<boolean>;
  abstract create(data: { attendanceId: string; employeeId: string; reason: string }): Promise<JustificationDetail>;
  /** Las 200 más recientes. */
  abstract list(filter: { status?: JustificationStatus; employeeId?: string }): Promise<JustificationDetail[]>;
  abstract findById(id: string): Promise<JustificationRecord | null>;
  /** Guarda la revisión solo si sigue pendiente; false si otra persona se adelantó. */
  abstract reviewIfPending(id: string, review: Review, tx: TransactionContext): Promise<boolean>;
  abstract detail(id: string, tx?: TransactionContext): Promise<JustificationDetail>;
}
