import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { coordinatesProblem, DEFAULT_RADIUS_METERS } from '../domain/geofence';
import { Site, siteDeletionBlocker } from '../domain/site-rules';
import { SiteData, SiteRepository } from './ports/site.repository';

export interface SiteInput {
  name?: string;
  address?: string | null;
  active?: boolean;
  lat?: number | null;
  lng?: number | null;
  radiusMeters?: number | null;
}

function location(input: SiteInput, current: Pick<Site, 'lat' | 'lng' | 'radiusMeters'>) {
  const lat = input.lat === undefined ? current.lat : input.lat;
  const lng = input.lng === undefined ? current.lng : input.lng;
  let radiusMeters = input.radiusMeters === undefined ? current.radiusMeters : input.radiusMeters;
  if (lat === null) radiusMeters = null;
  else if (radiusMeters === null) radiusMeters = DEFAULT_RADIUS_METERS;
  const problem = coordinatesProblem(lat, lng, radiusMeters);
  if (problem) throw new BusinessRuleError(problem);
  return { lat, lng, radiusMeters };
}

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
    const data: SiteData = {
      name: input.name,
      address: input.address || null,
      active: input.active ?? true,
      ...location(input, { lat: null, lng: null, radiusMeters: null }),
    };
    return this.uow.run(async (tx) => {
      const site = await this.sites.create(data, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Site', entityId: site.id, after: site }, tx);
      return site;
    });
  }

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
      ...location(input, before),
    };
    return this.uow.run(async (tx) => {
      const site = await this.sites.update(id, data, tx);
      await this.audit.record({ userId: actorId, action: 'UPDATE', entity: 'Site', entityId: id, before, after: site }, tx);
      return site;
    });
  }

  async remove(id: string, actorId: string) {
    const before = await this.get(id);
    const blocker = siteDeletionBlocker(await this.sites.usage(id));
    if (blocker) throw new BusinessRuleError(blocker);
    await this.uow.run(async (tx) => {
      await this.sites.delete(id, tx);
      await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'Site', entityId: id, before }, tx);
    });
    return { deleted: true };
  }
}
