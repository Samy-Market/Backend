import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Role } from '../../../../shared/domain/roles';
import { Account } from '../../domain/account';
import { ResetRecord } from '../../domain/password-reset';

export interface Profile {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  employee: { id: string; fullName: string; documentId: string; position: string; site: { id: string; name: string } } | null;
}

export abstract class AccountRepository {
  abstract findByEmail(email: string): Promise<Account | null>;
  abstract findById(id: string): Promise<Account | null>;
  abstract profile(id: string): Promise<Profile | null>;
  abstract updatePassword(id: string, passwordHash: string, changedAt: Date): Promise<void>;
  abstract createReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  abstract findReset(tokenHash: string): Promise<ResetRecord | null>;
  abstract completeReset(resetId: string, userId: string, passwordHash: string, at: Date): Promise<boolean>;
  abstract countAdmins(tx?: TransactionContext): Promise<number>;
  abstract emailExists(email: string, tx?: TransactionContext): Promise<boolean>;
  abstract createAdmin(email: string, passwordHash: string, tx: TransactionContext): Promise<{ id: string; email: string; role: Role }>;
  abstract ensureSite(name: string, tx: TransactionContext): Promise<string>;
}
