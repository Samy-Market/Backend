import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../../../config/app.config';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { Role } from '../../../shared/domain/roles';
import { isValidDayKey } from '../../../shared/domain/calendar';
import { SchedulePlanner } from '../../schedules/application/schedule-planner';
import { absenceProblem, ALREADY_REVIEWED, assertCanReview, JustificationStatus, ReviewDecision } from '../domain/justification';
import { JustificationDetail, JustificationRepository } from './ports/justification.repository';

@Injectable()
export class JustificationsService {
  constructor(
    private justifications: JustificationRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
    private realtime: RealtimeNotifier,
    private planner: SchedulePlanner,
  ) {}

  async create(user: AuthUser, input: { attendanceId?: string; date?: string; reason: string }): Promise<JustificationDetail> {
    if (!user.employeeId) throw new ForbiddenError('Solo los empleados pueden solicitar justificaciones.');
    if (!!input.attendanceId === !!input.date) throw new BusinessRuleError('Indica la marcación o el día que quieres justificar.');
    const created = input.date
      ? await this.createForAbsence(user.employeeId, input.date, input.reason)
      : await this.createForMark(user.employeeId, input.attendanceId!, input.reason);
    this.realtime.justificationCreated(created);
    return created;
  }

  private async createForAbsence(employeeId: string, date: string, reason: string) {
    if (!isValidDayKey(date)) throw new BusinessRuleError('Fecha inválida.');
    const start = DateTime.fromISO(date, { zone: APP_TIMEZONE }).startOf('day');
    const [plan, marks] = await Promise.all([
      this.planner.planForEmployee(employeeId, date),
      this.justifications.marksBetween(employeeId, start.toJSDate(), start.plus({ days: 1 }).toJSDate()),
    ]);
    const problem = absenceProblem({ date, today: this.clock.today(), planKind: plan.kind, marks });
    if (problem) throw new BusinessRuleError(problem);
    const open = await this.justifications.openForDay(employeeId, date);
    if (open === 'PENDING') throw new ConflictError('Ya existe una solicitud pendiente para este día.');
    if (open === 'APPROVED') throw new ConflictError('Esta ausencia ya está justificada.');
    return this.justifications.create({ date, employeeId, reason });
  }

  private async createForMark(employeeId: string, attendanceId: string, reason: string) {
    // Mismo mensaje si no existe o es de otra persona, para no filtrar información.
    if ((await this.justifications.markOwner(attendanceId)) !== employeeId) {
      throw new NotFoundError('Marcación no encontrada.');
    }
    if (await this.justifications.hasPending(attendanceId)) {
      throw new ConflictError('Ya existe una solicitud pendiente para esta marcación.');
    }
    return this.justifications.create({ attendanceId, employeeId, reason });
  }

  list(user: AuthUser, status?: JustificationStatus) {
    const employeeId = user.role === Role.EMPLOYEE ? (user.employeeId ?? '__none__') : undefined;
    return this.justifications.list({ status, employeeId });
  }

  async review(id: string, decision: { status: ReviewDecision; reviewNote?: string }, reviewer: AuthUser): Promise<JustificationDetail> {
    const before = await this.justifications.findById(id);
    if (!before) throw new NotFoundError('Justificación no encontrada.');
    assertCanReview(before, reviewer.employeeId);

    const reviewed = await this.uow.run(async (tx) => {
      const review = {
        status: decision.status,
        reviewNote: decision.reviewNote ?? null,
        reviewedBy: reviewer.sub,
        reviewedAt: this.clock.now(),
      };
      // Solo si sigue pendiente: evita una doble aprobación simultánea.
      if (!(await this.justifications.reviewIfPending(id, review, tx))) throw new BusinessRuleError(ALREADY_REVIEWED);
      const after = await this.justifications.detail(id, tx);
      await this.audit.record(
        {
          userId: reviewer.sub,
          action: decision.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entity: 'Justification',
          entityId: id,
          before,
          after: { status: after.status, reviewNote: after.reviewNote, reviewedAt: after.reviewedAt },
        },
        tx,
      );
      return after;
    });
    this.realtime.justificationReviewed(reviewed.employeeId, reviewed);
    return reviewed;
  }
}
