import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { Shift, ShiftData } from '../domain/shift';
import { ShiftRepository } from './ports/shift.repository';

/** Casos de uso de los turnos (bloques horarios). */
@Injectable()
export class ShiftsService {
  constructor(
    private shifts: ShiftRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
  ) {}

  list() {
    return this.shifts.list();
  }

  async get(id: string): Promise<Shift> {
    const shift = await this.shifts.findById(id);
    if (!shift) throw new NotFoundError('Turno no encontrado.');
    return shift;
  }

  create(data: ShiftData, actorId: string) {
    return this.uow.run(async (tx) => {
      const shift = await this.shifts.create(data, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Shift', entityId: shift.id, after: shift }, tx);
      return shift;
    });
  }

  async update(id: string, data: Partial<ShiftData>, actorId: string) {
    const before = await this.get(id);
    return this.uow.run(async (tx) => {
      const shift = await this.shifts.update(id, data, tx);
      await this.audit.record({ userId: actorId, action: 'UPDATE', entity: 'Shift', entityId: id, before, after: shift }, tx);
      return shift;
    });
  }

  /** Solo se elimina un turno que ningún horario usa. */
  async remove(id: string, actorId: string) {
    const before = await this.get(id);
    if (await this.shifts.isUsedBySchedules(id)) {
      throw new BusinessRuleError('Este turno se usa en uno o más horarios. Quítalo de esos horarios antes de eliminarlo.');
    }
    await this.uow.run(async (tx) => {
      await this.shifts.delete(id, tx);
      await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'Shift', entityId: id, before }, tx);
    });
    return { deleted: true };
  }
}
