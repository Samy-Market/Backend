import { Injectable } from '@nestjs/common';
import { DayOff, dayOffFor, TimeOff } from '../domain/time-off';
import { TimeOffRepository } from './ports/time-off.repository';

@Injectable()
export class TimeOffCalendar {
  constructor(private repo: TimeOffRepository) {}

  async forRange(
    employeeIds: string[],
    fromKey: string,
    toKey: string,
  ): Promise<{ holidays: Map<string, string>; of: (id: string) => TimeOff }> {
    const [holidays, leaves] = await Promise.all([this.repo.holidays(fromKey, toKey), this.repo.leaveRules(employeeIds, fromKey, toKey)]);
    const map = new Map(holidays.map((h) => [h.date, h.name]));
    return { holidays: map, of: (id) => ({ holidays: map, leaves: leaves.get(id) ?? [] }) };
  }

  async dayOff(employeeId: string, date: string): Promise<DayOff | null> {
    const range = await this.forRange([employeeId], date, date);
    return dayOffFor(date, range.of(employeeId));
  }
}
