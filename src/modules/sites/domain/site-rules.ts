import { findCovering, rangesOverlap } from '../../../shared/domain/calendar';
import { AssignmentStatus } from '../../schedules/domain/schedule-plan';

export interface Site {
  id: string;
  name: string;
  address: string | null;
  active: boolean;
  lat: number | null;
  lng: number | null;
  radiusMeters: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteRef {
  id: string;
  name: string;
}

export interface TransferRule {
  id: string;
  siteId: string;
  startDate: string;
  endDate: string;
}

export interface DaySite {
  siteId: string;
  transferId: string | null;
}

export interface DaySiteView {
  site: SiteRef;
  homeSite: SiteRef;
  transferred: boolean;
  transferId: string | null;
}

export function siteForDay(homeSiteId: string, transfers: TransferRule[], dayKey: string): DaySite {
  const t = findCovering(transfers, dayKey);
  return t ? { siteId: t.siteId, transferId: t.id } : { siteId: homeSiteId, transferId: null };
}

export function overlappingTransfers<T extends TransferRule>(existing: T[], startDate: string, endDate: string): T[] {
  return existing.filter((t) => rangesOverlap(t, { startDate, endDate }));
}

export function toDaySiteView(d: DaySite, homeSiteId: string, names: Map<string, string>): DaySiteView {
  return {
    site: { id: d.siteId, name: names.get(d.siteId) ?? '—' },
    homeSite: { id: homeSiteId, name: names.get(homeSiteId) ?? '—' },
    transferred: !!d.transferId,
    transferId: d.transferId,
  };
}

export function transferStatus(t: { startDate: string; endDate: string }, today: string): AssignmentStatus {
  return t.startDate > today ? 'UPCOMING' : t.endDate < today ? 'PAST' : 'CURRENT';
}

export function siteDeletionBlocker(u: { employees: number; attendances: number; transfers: number }): string | null {
  if (u.employees) {
    return `Esta sede es la sede base de ${u.employees} ${u.employees === 1 ? 'empleado' : 'empleados'}. Cámbialos de sede primero.`;
  }
  if (u.attendances || u.transfers) {
    return 'Esta sede tiene marcaciones o traslados en el historial. En lugar de eliminarla, desactívala.';
  }
  return null;
}
