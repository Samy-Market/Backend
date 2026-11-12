import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { addDays, DayRange, isValidDayKey, rangesOverlap } from '../../../shared/domain/calendar';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { assignmentStatus, AssignmentStatus, trimmedEndFor, unassignOutcome } from '../domain/schedule-plan';
import { AssignmentRecord, AssignmentRepository } from './ports/assignment.repository';
import { EmployeeLookup } from './ports/employee-lookup';
import { SchedulesService } from './schedules.service';

export interface AssignInput {
  scheduleId: string;
  employeeIds: string[];
  startDate: string;
  endDate?: string | null;
}

export interface AssignmentView extends AssignmentRecord {
  status: AssignmentStatus;
}

const LOCK = 'schedule-assignments';

@Injectable()
export class AssignmentsService {
  constructor(
    private assignments: AssignmentRepository,
    private employees: EmployeeLookup,
    private schedules: SchedulesService,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
  ) {}

  async assign(input: AssignInput, actorId: string) {
    const range: DayRange = { startDate: input.startDate, endDate: input.endDate ?? null };
    if (!isValidDayKey(range.startDate) || (range.endDate && !isValidDayKey(range.endDate))) throw new BusinessRuleError('Fecha inválida.');
    if (range.endDate && range.endDate < range.startDate)
      throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio.');

    const schedule = await this.schedules.get(input.scheduleId);
    if (!schedule.active) throw new BusinessRuleError('Ese horario está desactivado. Actívalo antes de asignarlo.');

    const employees = await this.employees.findMany(input.employeeIds);
    if (employees.length !== input.employeeIds.length) throw new BusinessRuleError('Alguno de los empleados no existe.');

    return this.uow.run(
      async (tx) => {
        const existing = await this.assignments.listByEmployees(input.employeeIds, tx);
        const conflicts: string[] = [];
        const trims: { id: string; employeeId: string; endDate: string; before: string | null; record: AssignmentRecord }[] = [];
        for (const e of employees) {
          for (const a of existing.filter((x) => x.employeeId === e.id)) {
            if (!rangesOverlap(a, range)) continue;
            const newEnd = trimmedEndFor(a, range.startDate);
            if (newEnd) trims.push({ id: a.id, employeeId: e.id, endDate: newEnd, before: a.endDate, record: a });
            else
              conflicts.push(`${e.fullName} ya tiene "${a.schedule.name}" desde ${a.startDate}${a.endDate ? ` hasta ${a.endDate}` : ''}.`);
          }
        }
        if (conflicts.length) {
          throw new ConflictError(
            `No se pudo asignar porque hay horarios que se cruzan: ${conflicts.join(' ')} Ajusta las fechas o quita esa asignación primero.`,
          );
        }

        for (const t of trims) await this.assignments.trim(t.record, t.endDate, tx);
        for (const e of employees) await this.assignments.create(e.id, schedule.id, range, tx);
        await this.audit.record(
          {
            userId: actorId,
            action: 'ASSIGN',
            entity: 'Schedule',
            entityId: schedule.id,
            after: {
              schedule: schedule.name,
              ...range,
              employees: employees.map((e) => e.fullName),
              closedPrevious: trims.map(({ record: _r, ...t }) => t),
            },
          },
          tx,
        );
        return {
          assigned: employees.length,
          closedPrevious: trims.length,
          inactiveEmployees: employees.filter((e) => !e.active).map((e) => e.fullName),
        };
      },
      { lockKey: LOCK },
    );
  }

  async listForEmployee(employeeId: string): Promise<AssignmentView[]> {
    if (!(await this.employees.exists(employeeId))) throw new NotFoundError('Empleado no encontrado.');
    const today = this.clock.today();
    return (await this.assignments.listByEmployee(employeeId)).map((a) => this.view(a, today));
  }

  async updateEnd(id: string, endDate: string | null, actorId: string): Promise<AssignmentView> {
    const a = await this.assignments.findById(id);
    if (!a) throw new NotFoundError('Asignación no encontrada.');
    if (endDate && (!isValidDayKey(endDate) || endDate < a.startDate)) {
      throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio.');
    }
    return this.uow.run(
      async (tx) => {
        const others = (await this.assignments.listByEmployees([a.employeeId], tx)).filter((o) => o.id !== id);
        const clash = others.find((o) => rangesOverlap({ startDate: a.startDate, endDate }, o));
        if (clash) throw new ConflictError(`Esa fecha haría que se cruce con otro horario que empieza el ${clash.startDate}.`);
        const updated = await this.assignments.updateEnd(id, endDate, tx);
        await this.audit.record(
          {
            userId: actorId,
            action: 'UPDATE',
            entity: 'ScheduleAssignment',
            entityId: id,
            before: { endDate: a.endDate },
            after: { endDate },
          },
          tx,
        );
        return this.view(updated, this.clock.today());
      },
      { lockKey: LOCK },
    );
  }

  async remove(id: string, actorId: string) {
    const a = await this.assignments.findById(id);
    if (!a) throw new NotFoundError('Asignación no encontrada.');
    if (a.startDate <= this.clock.today()) {
      throw new BusinessRuleError('Este horario ya empezó: en lugar de eliminarlo, ponle una fecha de fin para conservar el historial.');
    }
    await this.uow.run(async (tx) => {
      await this.assignments.delete(id, tx);
      await this.audit.record(
        {
          userId: actorId,
          action: 'DELETE',
          entity: 'ScheduleAssignment',
          entityId: id,
          before: { schedule: a.schedule.name, startDate: a.startDate, endDate: a.endDate },
        },
        tx,
      );
    });
    return { deleted: true };
  }

  async members(scheduleId: string) {
    await this.schedules.get(scheduleId);
    const today = this.clock.today();
    return (await this.assignments.listBySchedule(scheduleId, today)).map((m) => ({ ...m, status: assignmentStatus(m, today) }));
  }

  async previewUnassign(ids: string[]) {
    const today = this.clock.today();
    const found = await this.assignments.findMany(ids);
    if (found.length !== new Set(ids).size) throw new NotFoundError('Alguna de las asignaciones ya no existe.');
    const employeeIds = [...new Set(found.map((a) => a.employeeId))];
    const [all, people] = await Promise.all([this.assignments.listByEmployees(employeeIds), this.employees.findMany(employeeIds)]);
    const names = new Map(people.map((p) => [p.id, p.fullName]));
    const inactive = await this.inactiveSchedules(all.map((a) => a.schedule.id));
    return found.map((a) => {
      const o = unassignOutcome(
        a,
        all.filter((x) => x.employeeId === a.employeeId),
        today,
      );
      return {
        id: a.id,
        employee: { id: a.employeeId, fullName: names.get(a.employeeId) ?? '—' },
        schedule: a.schedule,
        action: o.action.kind,
        gap: o.gap,
        previous: o.previous && {
          schedule: o.previous.schedule,
          until: o.previous.until,
          canRestore: !inactive.has(o.previous.schedule.id),
        },
      };
    });
  }

  async unassign(ids: string[], actorId: string, restorePrevious = false) {
    const today = this.clock.today();
    const inactive = restorePrevious ? await this.inactiveSchedules(await this.previousScheduleIds(ids)) : new Set<string>();
    return this.uow.run(
      async (tx) => {
        const found = await this.assignments.findMany(ids, tx);
        if (found.length !== new Set(ids).size) throw new NotFoundError('Alguna de las asignaciones ya no existe.');
        const all = await this.assignments.listByEmployees([...new Set(found.map((a) => a.employeeId))], tx);
        let deleted = 0;
        let ended = 0;
        let restored = 0;
        const skipped: string[] = [];
        for (const a of found) {
          const o = unassignOutcome(
            a,
            all.filter((x) => x.employeeId === a.employeeId),
            today,
          );
          if (o.action.kind === 'delete') {
            await this.assignments.delete(a.id, tx);
            deleted++;
          } else if (o.action.kind === 'end') {
            await this.assignments.updateEnd(a.id, o.action.endDate, tx);
            ended++;
          } else {
            skipped.push(o.action.reason);
            continue;
          }
          if (restorePrevious && o.restore && o.previous && !inactive.has(o.previous.schedule.id)) {
            const plan = o.restore;
            if (plan.kind === 'extend') {
              await this.assignments.restoreEnd(
                all.find((x) => x.id === plan.id)!,
                plan.endDate,
                tx,
              );
            } else {
              await this.assignments.create(a.employeeId, plan.scheduleId, { startDate: plan.startDate, endDate: plan.endDate }, tx);
            }
            restored++;
          }
        }
        await this.audit.record(
          {
            userId: actorId,
            action: 'UNASSIGN',
            entity: 'ScheduleAssignment',
            entityId: found[0]?.id ?? '',
            before: found.map((a) => ({
              id: a.id,
              employeeId: a.employeeId,
              schedule: a.schedule.name,
              startDate: a.startDate,
              endDate: a.endDate,
            })),
            after: { deleted, ended, restored, endDate: today },
          },
          tx,
        );
        return { deleted, ended, restored, skipped: skipped.length };
      },
      { lockKey: LOCK },
    );
  }

  async expiring(days: number) {
    const today = this.clock.today();
    const ending = await this.assignments.endingBetween(today, addDays(today, days));
    const result = [];
    for (const a of ending) {
      if (!(await this.assignments.hasCoverage(a.employee.id, addDays(a.endDate, 1)))) {
        result.push({ assignmentId: a.id, employee: a.employee, schedule: a.schedule, endDate: a.endDate });
      }
    }
    return result;
  }

  private async previousScheduleIds(ids: string[]) {
    const found = await this.assignments.findMany(ids);
    const all = await this.assignments.listByEmployees([...new Set(found.map((a) => a.employeeId))]);
    return all.map((a) => a.schedule.id);
  }

  private async inactiveSchedules(scheduleIds: string[]): Promise<Set<string>> {
    const unique = [...new Set(scheduleIds)];
    const schedules = await Promise.all(unique.map((id) => this.schedules.get(id)));
    return new Set(schedules.filter((s) => !s.active).map((s) => s.id));
  }

  private view(a: AssignmentRecord, today: string): AssignmentView {
    return { ...a, status: assignmentStatus(a, today) };
  }
}
