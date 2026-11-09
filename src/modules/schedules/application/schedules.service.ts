import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { ShiftRepository } from '../../shifts/application/ports/shift.repository';
import { assertHasWorkDay, assertSevenDays, scheduleDeletionBlocker } from '../domain/schedule-plan';
import { ScheduleData, ScheduleDetail, ScheduleRepository, WeekDayInput } from './ports/schedule.repository';

export interface ScheduleInput {
  name: string;
  description?: string | null;
  active?: boolean;
  days: WeekDayInput[];
}

@Injectable()
export class SchedulesService {
  constructor(
    private schedules: ScheduleRepository,
    private shifts: ShiftRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
  ) {}

  list() {
    return this.schedules.list(this.clock.today());
  }

  async get(id: string): Promise<ScheduleDetail> {
    const s = await this.schedules.findById(id);
    if (!s) throw new NotFoundError('Horario no encontrado.');
    return s;
  }

  async create(input: ScheduleInput, actorId: string) {
    await this.validateWeek(input.days);
    const data: ScheduleData = { name: input.name, description: input.description || null, active: input.active ?? true };
    return this.uow.run(async (tx) => {
      const s = await this.schedules.create(data, input.days, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Schedule', entityId: s.id, after: s }, tx);
      return s;
    });
  }

  async update(id: string, input: Partial<ScheduleInput>, actorId: string) {
    const before = await this.get(id);
    if (input.days) await this.validateWeek(input.days);
    const data: Partial<ScheduleData> = {
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      active: input.active,
    };
    return this.uow.run(async (tx) => {
      const s = await this.schedules.update(id, data, input.days, tx);
      await this.audit.record({ userId: actorId, action: 'UPDATE', entity: 'Schedule', entityId: id, before, after: s }, tx);
      return s;
    });
  }

  async remove(id: string, actorId: string) {
    const before = await this.get(id);
    const blocker = scheduleDeletionBlocker(await this.schedules.usage(id, this.clock.today()));
    if (blocker) throw new BusinessRuleError(blocker);
    await this.uow.run(async (tx) => {
      await this.schedules.delete(id, tx);
      await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'Schedule', entityId: id, before }, tx);
    });
    return { deleted: true };
  }

  private async validateWeek(days: WeekDayInput[]) {
    assertSevenDays(days);
    const shiftIds = [...new Set(days.map((d) => d.shiftId).filter((x): x is string => !!x))];
    if (shiftIds.length && (await this.shifts.countByIds(shiftIds)) !== shiftIds.length) {
      throw new BusinessRuleError('Alguno de los turnos seleccionados no existe.');
    }
    assertHasWorkDay(days);
  }
}
