import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { Site } from '../domain/site-rules';
import { SiteData, SiteRepository } from './ports/site.repository';

export interface SiteInput {
  name?: string;
  address?: string | null;
  active?: boolean;
}

/** Casos de uso de las sedes. */
@Injectable()
export class SitesService {
  constructor(
    private sites: SiteRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
  ) {}

  list() {
    return this.sites.list(this.clock.today());
  }

  async get(id: string): Promise<Site> {
    const site = await this.sites.findById(id);
    if (!site) throw new NotFoundError('Sede no encontrada.');
    return site;
  }

  create(input: SiteInput & { name: string }, actorId: string) {
    const data: SiteData = { name: input.name, address: input.address || null, active: input.active ?? true };
    return this.uow.run(async (tx) => {
      const site = await this.sites.create(data, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Site', entityId: site.id, after: site }, tx);
      return site;
    });
  }

  /** No se puede desactivar una sede que todavía es la base de empleados activos. */
  async update(id: string, input: SiteInput, actorId: string) {
    const before = await this.get(id);
    if (input.active === false && before.active) {
      const n = await this.sites.countActiveEmployees(id);
      if (n) {
        throw new BusinessRuleError(
          `No se puede desactivar: ${n} ${n === 1 ? 'empleado activo tiene' : 'empleados activos tienen'} esta sede como base. Muévelos a otra sede primero.`,
        );
      }
    }
    const data: Partial<SiteData> = {
      name: input.name,
      address: input.address === undefined ? undefined : input.address || null,
      active: input.active,
    };
    return this.uow.run(async (tx) => {
      const site = await this.sites.update(id, data, tx);
      await this.audit.record({ userId: actorId, action: 'UPDATE', entity: 'Site', entityId: id, before, after: site }, tx);
      return site;
    });
  }

  /** Solo se elimina una sede que nunca se usó; con historial, se desactiva. */
  async remove(id: string, actorId: string) {
    const before = await this.get(id);
    const u = await this.sites.usage(id);
    if (u.employees || u.attendances || u.transfers) {
      throw new BusinessRuleError('Esta sede ya tiene empleados, marcaciones o traslados. En lugar de eliminarla, desactívala.');
    }
    await this.uow.run(async (tx) => {
      await this.sites.delete(id, tx);
      await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'Site', entityId: id, before }, tx);
    });
    return { deleted: true };
  }
}
