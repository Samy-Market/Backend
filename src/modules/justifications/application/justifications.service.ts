import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_TIMEZONE, MAX_SESSION_HOURS } from '../../../config/app.config';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { AuthUser } from '../../../shared/domain/auth-user';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors';
import { Role } from '../../../shared/domain/roles';
import { isValidDayKey } from '../../../shared/domain/calendar';
import { SchedulePlanner } from '../../schedules/application/schedule-planner';
import { computeLateness, computePreEntry, parseHHmm } from '../../attendance/domain/attendance-rules';
import { SiteLocator } from '../../sites/application/site-locator';
import {
  absenceProblem,
  ALREADY_REVIEWED,
  assertCanReview,
  exitProblem,
  JustificationStatus,
  creditProblem,
  creditWindow,
  missingExitWindow,
  ReviewDecision,
  workedDayProblem,
} from '../domain/justification';
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
    private locator: SiteLocator,
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

  async correction(id: string) {
    const j = await this.justifications.findById(id);
    if (!j) throw new NotFoundError('Justificación no encontrada.');
    if (j.status !== 'PENDING') return { missingExit: null, missingDay: null, credit: null };
    if (j.attendanceId) {
      const [missingExit, credit] = await Promise.all([this.exitWindow(j.attendanceId), this.creditWindowFor(j.attendanceId)]);
      return { missingExit, missingDay: null, credit };
    }
    const plan = await this.planner.planForEmployee(j.employeeId, j.date!);
    const shift = plan.kind === 'WORK' ? plan.shift : null;
    return {
      missingExit: null,
      credit: null,
      missingDay: {
        date: j.date,
        shift: shift && { startTime: shift.startTime, endTime: shift.endTime, toleranceMinutes: shift.toleranceMinutes },
      },
    };
  }

  private async shiftOn(employeeId: string, at: Date) {
    const local = DateTime.fromJSDate(at, { zone: APP_TIMEZONE });
    const plan = await this.planner.planForEmployee(employeeId, local.toISODate()!);
    return plan.kind === 'WORK' ? plan.shift : null;
  }

  private async creditWindowFor(attendanceId: string, tx?: Parameters<JustificationRepository['markAndNext']>[1]) {
    const found = await this.justifications.markAndNext(attendanceId, tx);
    if (!found) return null;
    const shift = await this.shiftOn(found.mark.employeeId, found.mark.timestamp);
    const start = shift && parseHHmm(shift.startTime);
    const shiftStart = start
      ? DateTime.fromJSDate(found.mark.timestamp, { zone: APP_TIMEZONE })
          .startOf('day')
          .set({ hour: start.hour, minute: start.minute })
          .toJSDate()
      : null;
    return creditWindow(found.mark, found.previous, shiftStart, MAX_SESSION_HOURS);
  }

  private async exitWindow(attendanceId: string, tx?: Parameters<JustificationRepository['markAndNext']>[1]) {
    const found = await this.justifications.markAndNext(attendanceId, tx);
    if (!found) return null;
    const inLocal = DateTime.fromJSDate(found.mark.timestamp, { zone: APP_TIMEZONE });
    const plan = await this.planner.planForEmployee(found.mark.employeeId, inLocal.toISODate()!);
    let shiftEnd: Date | null = null;
    if (plan.kind === 'WORK') {
      const start = parseHHmm(plan.shift.startTime);
      const end = parseHHmm(plan.shift.endTime);
      let at = inLocal.startOf('day').set({ hour: end.hour, minute: end.minute });
      if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) at = at.plus({ days: 1 });
      shiftEnd = at.toJSDate();
    }
    const dayEnded = inLocal.toISODate()! < this.clock.today();
    return missingExitWindow(found.mark, found.next, this.clock.now(), MAX_SESSION_HOURS, shiftEnd, dayEnded);
  }

  private async workedDay(employeeId: string, date: string, from: string, to: string) {
    const day = DateTime.fromISO(date, { zone: APP_TIMEZONE });
    const a = parseHHmm(from);
    const inAt = day.set({ hour: a.hour, minute: a.minute }).toJSDate();
    const outAt = this.exitAt(inAt, to);
    const problem = workedDayProblem(inAt, outAt, this.clock.now(), MAX_SESSION_HOURS);
    if (problem) throw new BusinessRuleError(problem);
    if ((await this.justifications.marksBetween(employeeId, day.startOf('day').toJSDate(), outAt)) > 0) {
      throw new BusinessRuleError('Ese día ya tiene marcaciones: justifica la marcación en vez del día.');
    }
    const plan = await this.planner.planForEmployee(employeeId, date);
    const shift = plan.kind === 'WORK' ? plan.shift : null;
    const homeSiteId = await this.justifications.employeeSite(employeeId);
    const site = (await this.locator.sitesForDay([{ id: employeeId, siteId: homeSiteId }], date)).get(employeeId)!;
    const late = { ...computeLateness(inAt, shift, APP_TIMEZONE), ...computePreEntry(inAt, shift, APP_TIMEZONE) };
    return {
      inMark: { type: 'IN' as const, timestamp: inAt, ...late },
      outMark: { type: 'OUT' as const, timestamp: outAt },
      siteId: site.siteId,
    };
  }

  /** La salida va el mismo día del ingreso; si la hora es anterior al ingreso, es del día siguiente (turno nocturno). */
  private exitAt(inAt: Date, hhmm: string): Date {
    const inLocal = DateTime.fromJSDate(inAt, { zone: APP_TIMEZONE });
    const { hour, minute } = parseHHmm(hhmm);
    let at = inLocal.startOf('day').set({ hour, minute });
    if (at <= inLocal) at = at.plus({ days: 1 });
    return at.toJSDate();
  }

  async review(
    id: string,
    decision: {
      status: ReviewDecision;
      reviewNote?: string;
      exitTime?: string;
      workedFrom?: string;
      workedTo?: string;
      creditFrom?: string;
    },
    reviewer: AuthUser,
  ): Promise<JustificationDetail> {
    const before = await this.justifications.findById(id);
    if (!before) throw new NotFoundError('Justificación no encontrada.');
    assertCanReview(before, reviewer.employeeId);
    if (decision.exitTime && decision.status !== 'APPROVED') {
      throw new BusinessRuleError('Solo se registra la salida al aprobar la justificación.');
    }
    if (decision.exitTime && !before.attendanceId) throw new BusinessRuleError('Esta justificación no es de un ingreso.');
    if (decision.creditFrom && decision.status !== 'APPROVED') {
      throw new BusinessRuleError('Solo se ajusta la hora de llegada al aprobar la justificación.');
    }
    if (decision.creditFrom && !before.attendanceId) throw new BusinessRuleError('Esta justificación no es de un ingreso.');
    const worked = !!(decision.workedFrom || decision.workedTo);
    if (worked) {
      if (!decision.workedFrom || !decision.workedTo) throw new BusinessRuleError('Indica la hora de ingreso y la de salida.');
      if (decision.status !== 'APPROVED') throw new BusinessRuleError('Solo se registran las horas al aprobar la justificación.');
      if (!before.date) throw new BusinessRuleError('Esta justificación no es de un día sin marcas.');
    }

    const reviewed = await this.uow.run(
      async (tx) => {
        let exit: { at: Date; siteId: string | null } | null = null;
        if (decision.exitTime) {
          const w = await this.exitWindow(before.attendanceId!, tx);
          if (!w)
            throw new BusinessRuleError(
              'No se puede registrar la salida: ese ingreso ya tiene salida o su jornada todavía no termina (se puede después de la hora de salida del turno).',
            );
          const at = this.exitAt(w.inAt, decision.exitTime);
          const problem = exitProblem(at, w);
          if (problem) throw new BusinessRuleError(problem);
          const found = await this.justifications.markAndNext(before.attendanceId!, tx);
          exit = { at, siteId: found!.mark.siteId };
        }
        let credit: Date | null = null;
        if (decision.creditFrom) {
          const w = await this.creditWindowFor(before.attendanceId!, tx);
          if (!w) throw new BusinessRuleError('Esa marcación no admite ajustar la hora de llegada.');
          const { hour, minute } = parseHHmm(decision.creditFrom);
          credit = DateTime.fromJSDate(w.inAt, { zone: APP_TIMEZONE }).startOf('day').set({ hour, minute }).toJSDate();
          const problem = creditProblem(credit, w);
          if (problem) throw new BusinessRuleError(problem);
        }
        const day = worked ? await this.workedDay(before.employeeId, before.date!, decision.workedFrom!, decision.workedTo!) : null;
        const review = {
          status: decision.status,
          reviewNote: decision.reviewNote ?? null,
          reviewedBy: reviewer.sub,
          reviewedAt: this.clock.now(),
        };
        // Solo si sigue pendiente: evita una doble aprobación simultánea.
        if (!(await this.justifications.reviewIfPending(id, review, tx))) throw new BusinessRuleError(ALREADY_REVIEWED);
        if (exit) await this.justifications.createManualMark(before.employeeId, { type: 'OUT', timestamp: exit.at }, exit.siteId, id, tx);
        if (day) {
          await this.justifications.createManualMark(before.employeeId, day.inMark, day.siteId, id, tx);
          await this.justifications.createManualMark(before.employeeId, day.outMark, day.siteId, id, tx);
        }
        if (credit) await this.justifications.setCredit(before.attendanceId!, credit, id, tx);
        const after = await this.justifications.detail(id, tx);
        await this.audit.record(
          {
            userId: reviewer.sub,
            action: decision.status === 'APPROVED' ? 'APPROVE' : 'REJECT',
            entity: 'Justification',
            entityId: id,
            before,
            after: {
              status: after.status,
              reviewNote: after.reviewNote,
              reviewedAt: after.reviewedAt,
              ...(exit && { manualExitAt: exit.at }),
              ...(day && { manualInAt: day.inMark.timestamp, manualOutAt: day.outMark.timestamp }),
              ...(credit && { creditedFrom: credit }),
            },
          },
          tx,
        );
        return after;
      },
      { lockKey: before.employeeId },
    );
    this.realtime.justificationReviewed(reviewed.employeeId, reviewed);
    return reviewed;
  }

  async revert(id: string, actor: AuthUser): Promise<JustificationDetail> {
    const before = await this.justifications.findById(id);
    if (!before) throw new NotFoundError('Justificación no encontrada.');
    if (before.status === 'PENDING') throw new BusinessRuleError('Esta justificación todavía no tiene una decisión que deshacer.');

    const reverted = await this.uow.run(
      async (tx) => {
        const marks = await this.justifications.changedMarks(id, tx);
        if (marks.some((m) => m.manual && m.justified)) {
          throw new BusinessRuleError('Una de las marcaciones que registró el jefe tiene su propia justificación. Resuélvela primero.');
        }
        const manualIds = marks.filter((m) => m.manual).map((m) => m.id);
        if (!(await this.justifications.reopen(id, tx))) throw new BusinessRuleError('Esta justificación ya está pendiente.');
        await this.justifications.undoMarks(id, manualIds, tx);
        const after = await this.justifications.detail(id, tx);
        await this.audit.record(
          {
            userId: actor.sub,
            action: 'REVERT',
            entity: 'Justification',
            entityId: id,
            before: { status: before.status, reviewedBy: before.reviewedBy, reviewedAt: before.reviewedAt, reviewNote: before.reviewNote },
            after: { status: 'PENDING', removedMarks: manualIds.length, removedCredit: marks.some((m) => !m.manual) },
          },
          tx,
        );
        return after;
      },
      { lockKey: before.employeeId },
    );
    this.realtime.justificationReviewed(reverted.employeeId, reverted);
    return reverted;
  }
}
