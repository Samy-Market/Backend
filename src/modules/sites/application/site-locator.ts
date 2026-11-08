import { Injectable } from '@nestjs/common';
import { DaySite, DaySiteView, siteForDay, toDaySiteView, TransferRule } from '../domain/site-rules';
import { SiteRepository } from './ports/site.repository';
import { TransferRepository } from './ports/transfer.repository';

/** Dónde trabaja cada empleado cada día. Es la API pública del módulo para asistencia y reportes. */
@Injectable()
export class SiteLocator {
  constructor(
    private sites: SiteRepository,
    private transfers: TransferRepository,
  ) {}

  transfersFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, TransferRule[]>> {
    return this.transfers.rulesFor(employeeIds, fromKey, toKey);
  }

  siteNames(): Promise<Map<string, string>> {
    return this.sites.names();
  }

  async sitesForDay(employees: { id: string; siteId: string }[], dayKey: string): Promise<Map<string, DaySite>> {
    const map = await this.transfersFor(
      employees.map((e) => e.id),
      dayKey,
      dayKey,
    );
    return new Map(employees.map((e) => [e.id, siteForDay(e.siteId, map.get(e.id) ?? [], dayKey)]));
  }

  async daySiteView(employee: { id: string; siteId: string }, dayKey: string): Promise<DaySiteView> {
    const [map, names] = await Promise.all([this.sitesForDay([employee], dayKey), this.siteNames()]);
    return toDaySiteView(map.get(employee.id)!, employee.siteId, names);
  }
}
