import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { StaffChanges, StaffRole, StaffUser } from '../../domain/staff-user';

export abstract class StaffUserRepository {
  abstract list(): Promise<StaffUser[]>;
  abstract findStaff(id: string): Promise<StaffUser | null>;
  abstract create(
    data: { email: string; role: StaffRole; active: boolean; passwordHash: string },
    tx: TransactionContext,
  ): Promise<StaffUser>;
  abstract update(id: string, changes: StaffChanges & { passwordHash?: string }, tx: TransactionContext): Promise<StaffUser>;
  abstract countOtherActiveAdmins(id: string, tx: TransactionContext): Promise<number>;
}
