import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { addDays, isValidDayKey } from '../../../shared/domain/calendar';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { cancelLeaveAction, LEAVE_LABEL, LeaveKind, leaveStatus, overlappingLeaves } from '../domain/time-off';
import { TimeOffRepository } from './ports/time-off.repository';

const MAX_LEAVE_DAYS = 366;

@Injectable()
export class TimeOffService {
  constructor(
    private repo: TimeOffRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
  ) {}

  holidays(year?: number) {
    const y = year ?? Number(this.clock.today().slice(0, 4));
    return this.repo.holidays(`${y}-01-01`, `${y}-12-31`);
  }

  async createHoliday(input: { date: string; name: string }, actorId: string) {
    if (!isValidDayKey(input.date)) throw new BusinessRuleError('Fecha inválida.');
    const [same] = await this.repo.holidays(input.date, input.date);
    if (same) throw new ConflictError(`Ese día ya es feriado: ${same.name}.`);
    const holiday = await this.repo.createHoliday(input);
    await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Holiday', entityId: holiday.id, after: holiday });
    return holiday;
  }

  async deleteHoliday(id: string, actorId: string) {
    const before = await this.repo.findHoliday(id);
    if (!before) throw new NotFoundError('Feriado no encontrado.');
    await this.repo.deleteHoliday(id);
    await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'Holiday', entityId: id, before });
    return { deleted: true };
  }

  async leaves(scope: 'CURRENT' | 'ALL' = 'CURRENT', employeeId?: string) {
    const today = this.clock.today();
    const rows = await this.repo.leaves({ endingFrom: scope === 'ALL' ? undefined : today, employeeId });
    return rows.map((l) => ({ ...l, label: LEAVE_LABEL[l.kind], status: leaveStatus(l, today) }));
  }

  async createLeave(input: { employeeIds: string[]; kind: LeaveKind; startDate: string; endDate: string; note?: string }, actorId: string) {
    if (!isValidDayKey(input.startDate) || !isValidDayKey(input.endDate)) throw new BusinessRuleError('Fecha inválida.');
    if (input.endDate < input.startDate) throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio.');
    const days = DateTime.fromISO(input.endDate).diff(DateTime.fromISO(input.startDate), 'days').days + 1;
    if (days > MAX_LEAVE_DAYS) throw new BusinessRuleError(`Un permiso no puede durar más de ${MAX_LEAVE_DAYS} días.`);

    const employees = await this.repo.employees(input.employeeIds);
    if (employees.length !== input.employeeIds.length) throw new BusinessRuleError('Alguno de los empleados no existe.');

    await this.uow.run(
      async (tx) => {
        const existing = await this.repo.leavesByEmployees(input.employeeIds, tx);
        const conflicts: string[] = [];
        for (const e of employees) {
          for (const c of overlappingLeaves(
            existing.filter((x) => x.employeeId === e.id),
            input.startDate,
            input.endDate,
          )) {
            conflicts.push(`${e.fullName} ya tiene ${LEAVE_LABEL[c.kind].toLowerCase()} del ${c.startDate} al ${c.endDate}.`);
          }
        }
        if (conflicts.length) throw new ConflictError(`Hay permisos que se cruzan: ${conflicts.join(' ')}`);
        for (const e of employees) {
          await this.repo.createLeave(
            {
              employeeId: e.id,
              kind: input.kind,
              startDate: input.startDate,
              endDate: input.endDate,
              note: input.note?.trim() || null,
              createdBy: actorId,
            },
            tx,
          );
        }
        await this.audit.record(
          { userId: actorId, action: 'CREATE', entity: 'Leave', entityId: input.employeeIds.join(','), after: input },
          tx,
        );
      },
      { lockKey: 'leaves' },
    );
    return { created: employees.length };
  }

  async cancelLeave(id: string, actorId: string) {
    const leave = await this.repo.findLeave(id);
    if (!leave) throw new NotFoundError('Permiso no encontrado.');
    const today = this.clock.today();
    const action = cancelLeaveAction(leave, today, addDays(today, -1));
    if (action.kind === 'none') throw new BusinessRuleError(action.reason);
    if (action.kind === 'delete') await this.repo.deleteLeave(id);
    else await this.repo.endLeave(id, action.endDate);
    await this.audit.record({
      userId: actorId,
      action: action.kind === 'delete' ? 'DELETE' : 'END',
      entity: 'Leave',
      entityId: id,
      before: leave,
    });
    return action.kind === 'delete' ? { deleted: true } : { ended: true, endDate: action.endDate };
  }
}
