import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { SiteRef, TransferRule } from '../../domain/site-rules';

export interface TransferDetail extends TransferRule {
  employee: { id: string; fullName: string; position: string };
  fromSite: SiteRef;
  toSite: SiteRef;
  reason: string | null;
  createdBy: string;
}

export interface TransferDraft extends Omit<TransferRule, 'id'> {
  employeeId: string;
  reason: string | null;
  createdBy: string;
}

export abstract class TransferRepository {
  abstract rulesFor(employeeIds: string[], fromKey: string, toKey: string): Promise<Map<string, TransferRule[]>>;
  abstract list(filter: { endingFrom?: string; siteId?: string }): Promise<TransferDetail[]>;
  abstract findById(id: string): Promise<(TransferRule & { employeeId: string; siteName: string }) | null>;
  abstract listByEmployees(
    employeeIds: string[],
    tx?: TransactionContext,
  ): Promise<(TransferRule & { employeeId: string; siteName: string })[]>;
  abstract create(draft: TransferDraft, tx?: TransactionContext): Promise<void>;
  abstract updateEnd(id: string, endDate: string, tx?: TransactionContext): Promise<void>;
  abstract delete(id: string, tx?: TransactionContext): Promise<void>;
  abstract hasMarksDuring(transferId: string): Promise<boolean>;
}
