import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { addDays, DayRange, isValidDayKey, rangesOverlap } from '../../../shared/domain/calendar';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { assignmentStatus, AssignmentStatus, trimmedEndFor } from '../domain/schedule-plan';
import { AssignmentRecord, AssignmentRepository } from './ports/assignment.repository';
import { EmployeeLookup } from './ports/employee-lookup';
import { SchedulesService } from './schedules.service';

export interface AssignInput {
  scheduleId: string;
  employeeIds: string[];
  startDate: string;
  endDate?: string | null;
}

/** Asignación tal como se expone por la API. */
export interface AssignmentView extends AssignmentRecord {
  status: AssignmentStatus;
}

const LOCK = 'schedule-assignments';

/** Casos de uso de las asignaciones de horarios (rotaciones). */
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

  /**
   * Asigna un horario a varios empleados. Si un empleado tiene un horario vigente que
   * empezó antes, ese horario termina automáticamente el día anterior (rotación).
   * Si choca con un horario que empieza dentro del nuevo periodo, se rechaza.
   */
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
        const trims: { id: string; employeeId: string; endDate: string; before: string | null }[] = [];
        for (const e of employees) {
          for (const a of existing.filter((x) => x.employeeId === e.id)) {
            if (!rangesOverlap(a, range)) continue;
            const newEnd = trimmedEndFor(a, range.startDate);
            if (newEnd) trims.push({ id: a.id, employeeId: e.id, endDate: newEnd, before: a.endDate });
            else
              conflicts.push(`${e.fullName} ya tiene "${a.schedule.name}" desde ${a.startDate}${a.endDate ? ` hasta ${a.endDate}` : ''}.`);
          }
        }
        if (conflicts.length) {
          throw new ConflictError(
            `No se pudo asignar porque hay horarios que se cruzan: ${conflicts.join(' ')} Ajusta las fechas o quita esa asignación primero.`,
          );
        }

        for (const t of trims) await this.assignments.updateEnd(t.id, t.endDate, tx);
        for (const e of employees) await this.assignments.create(e.id, schedule.id, range, tx);
        await this.audit.record(
          {
            userId: actorId,
            action: 'ASSIGN',
            entity: 'Schedule',
            entityId: schedule.id,
            after: { schedule: schedule.name, ...range, employees: employees.map((e) => e.fullName), closedPrevious: trims },
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

  /** Cambia (o quita) la fecha de fin de una asignación. */
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

  /** Solo se eliminan asignaciones que aún no empiezan; las demás se terminan con una fecha de fin. */
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

  /** Rotaciones que terminan en los próximos `days` días y aún no tienen un horario siguiente. */
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

  private view(a: AssignmentRecord, today: string): AssignmentView {
    return { ...a, status: assignmentStatus(a, today) };
  }
}
