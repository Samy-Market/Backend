/**
 * Reglas puras de sedes: en qué sede trabaja un empleado un día concreto.
 * Si hay un traslado vigente ese día manda el traslado; si no, su sede base.
 */
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
  /** "yyyy-MM-dd", inclusivo */
  startDate: string;
  /** "yyyy-MM-dd", inclusivo */
  endDate: string;
}

export interface DaySite {
  siteId: string;
  /** Traslado que define la sede ese día, o null si es la sede base. */
  transferId: string | null;
}

/** Sede del día lista para mostrar: dónde trabaja, cuál es su base y si es por traslado. */
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

/** Traslados del mismo empleado que se cruzan con el periodo indicado. */
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
