import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Site } from '../../domain/site-rules';

export interface SiteData {
  name: string;
  address: string | null;
  active: boolean;
}

export interface SiteUsage {
  employees: number;
  attendances: number;
  transfers: number;
}

export abstract class SiteRepository {
  abstract list(today: string): Promise<(Site & { activeEmployees: number; incomingTransfersToday: number })[]>;
  abstract findById(id: string): Promise<Site | null>;
  abstract names(): Promise<Map<string, string>>;
  abstract countActiveEmployees(siteId: string): Promise<number>;
  abstract usage(siteId: string): Promise<SiteUsage>;
  abstract create(data: SiteData, tx?: TransactionContext): Promise<Site>;
  abstract update(id: string, data: Partial<SiteData>, tx?: TransactionContext): Promise<Site>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
}
