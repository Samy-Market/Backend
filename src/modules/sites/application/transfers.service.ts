import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { isValidDayKey } from '../../../shared/domain/calendar';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';
import { overlappingTransfers, transferStatus } from '../domain/site-rules';
import { StaffDirectory } from './ports/staff-directory';
import { TransferRepository } from './ports/transfer.repository';
import { SitesService } from './sites.service';

export interface TransferInput {
  employeeIds: string[];
  siteId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

const LOCK = 'site-transfers';

@Injectable()
export class TransfersService {
  constructor(
    private transfers: TransferRepository,
    private staff: StaffDirectory,
    private sites: SitesService,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
  ) {}

  async list(scope: 'CURRENT' | 'ALL' = 'CURRENT', siteId?: string) {
    const today = this.clock.today();
    const rows = await this.transfers.list({ endingFrom: scope === 'ALL' ? undefined : today, siteId });
    return rows.map(({ siteId: _s, ...t }) => ({
      id: t.id,
      employee: t.employee,
      fromSite: t.fromSite,
      toSite: t.toSite,
      startDate: t.startDate,
      endDate: t.endDate,
      reason: t.reason,
      createdBy: t.createdBy,
      status: transferStatus(t, today),
    }));
  }

  async create(input: TransferInput, actorId: string) {
    if (!isValidDayKey(input.startDate) || !isValidDayKey(input.endDate)) throw new BusinessRuleError('Fecha inválida.');
    if (input.endDate < input.startDate) throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio.');
    if (input.endDate < this.clock.today()) throw new BusinessRuleError('No se pueden registrar traslados que ya terminaron.');
    const site = await this.sites.get(input.siteId);
    if (!site.active) throw new BusinessRuleError('Esa sede está desactivada.');

    const employees = await this.staff.findMany(input.employeeIds);
    if (employees.length !== input.employeeIds.length) throw new BusinessRuleError('Alguno de los empleados no existe.');
    const sameSite = employees.filter((e) => e.siteId === site.id);
    if (sameSite.length) {
      throw new BusinessRuleError(
        `${sameSite.map((e) => e.fullName).join(', ')} ya ${sameSite.length === 1 ? 'pertenece' : 'pertenecen'} a ${site.name}.`,
      );
    }

    return this.uow.run(
      async (tx) => {
        const existing = await this.transfers.listByEmployees(input.employeeIds, tx);
        const conflicts: string[] = [];
        for (const e of employees) {
          const mine = existing.filter((x) => x.employeeId === e.id);
          for (const c of overlappingTransfers(mine, input.startDate, input.endDate)) {
            conflicts.push(`${e.fullName} ya tiene un traslado a ${c.siteName} del ${c.startDate} al ${c.endDate}.`);
          }
        }
        if (conflicts.length) throw new ConflictError(`Hay traslados que se cruzan: ${conflicts.join(' ')}`);

        for (const e of employees) {
          await this.transfers.create(
            {
              employeeId: e.id,
              siteId: site.id,
              startDate: input.startDate,
              endDate: input.endDate,
              reason: input.reason || null,
              createdBy: actorId,
            },
            tx,
          );
        }
        await this.audit.record(
          {
            userId: actorId,
            action: 'TRANSFER',
            entity: 'Site',
            entityId: site.id,
            after: {
              site: site.name,
              startDate: input.startDate,
              endDate: input.endDate,
              reason: input.reason ?? null,
              employees: employees.map((e) => e.fullName),
            },
          },
          tx,
        );
        return { created: employees.length };
      },
      { lockKey: LOCK },
    );
  }

  async updateEnd(id: string, endDate: string, actorId: string) {
    const t = await this.transfers.findById(id);
    if (!t) throw new NotFoundError('Traslado no encontrado.');
    if (!isValidDayKey(endDate) || endDate < t.startDate)
      throw new BusinessRuleError('La fecha de fin no puede ser anterior a la de inicio.');
    return this.uow.run(
      async (tx) => {
        const others = (await this.transfers.listByEmployees([t.employeeId], tx)).filter((o) => o.id !== id);
        const clash = overlappingTransfers(others, t.startDate, endDate);
        if (clash.length) throw new ConflictError(`Se cruzaría con otro traslado que empieza el ${clash[0].startDate}.`);
        await this.transfers.updateEnd(id, endDate, tx);
        await this.audit.record(
          { userId: actorId, action: 'UPDATE', entity: 'SiteTransfer', entityId: id, before: { endDate: t.endDate }, after: { endDate } },
          tx,
        );
        return { id, endDate };
      },
      { lockKey: LOCK },
    );
  }

  async remove(id: string, actorId: string) {
    const t = await this.transfers.findById(id);
    if (!t) throw new NotFoundError('Traslado no encontrado.');
    if (await this.transfers.hasMarksDuring(id)) {
      throw new BusinessRuleError('El empleado ya marcó durante este traslado. En lugar de quitarlo, cambia su fecha de fin.');
    }
    await this.uow.run(async (tx) => {
      await this.transfers.delete(id, tx);
      await this.audit.record(
        {
          userId: actorId,
          action: 'DELETE',
          entity: 'SiteTransfer',
          entityId: id,
          before: { site: t.siteName, startDate: t.startDate, endDate: t.endDate },
        },
        tx,
      );
    });
    return { deleted: true };
  }
}
