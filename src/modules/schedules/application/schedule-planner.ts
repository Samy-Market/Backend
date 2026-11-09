import { Injectable } from '@nestjs/common';
import { AssignmentRule, DayPlan, planForDay, planForRange } from '../domain/schedule-plan';
import { AssignmentRepository } from './ports/assignment.repository';

@Injectable()
export class SchedulePlanner {
  constructor(private assignments: AssignmentRepository) {}

  rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, AssignmentRule[]>> {
    return this.assignments.rulesFor(employeeIds, fromKey, toKey);
  }

  async planForEmployee(employeeId: string, dayKey: string): Promise<DayPlan> {
    const map = await this.rulesFor([employeeId], dayKey, dayKey);
    return planForDay(map.get(employeeId) ?? [], dayKey);
  }

  async plansForDay(employeeIds: string[], dayKey: string): Promise<Map<string, DayPlan>> {
    const map = await this.rulesFor(employeeIds, dayKey, dayKey);
    return new Map(employeeIds.map((id) => [id, planForDay(map.get(id) ?? [], dayKey)]));
  }

  async rangeForEmployee(employeeId: string, fromKey: string, toKey: string): Promise<DayPlan[]> {
    const map = await this.rulesFor([employeeId], fromKey, toKey);
    return planForRange(map.get(employeeId) ?? [], fromKey, toKey);
  }
}
