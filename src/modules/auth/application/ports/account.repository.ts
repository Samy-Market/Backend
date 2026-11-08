import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { Role } from '../../../../shared/domain/roles';
import { Account } from '../../domain/account';

/** Lo que ve la persona sobre sí misma ("mi perfil"). */
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
  abstract countAdmins(tx?: TransactionContext): Promise<number>;
  abstract emailExists(email: string, tx?: TransactionContext): Promise<boolean>;
  abstract createAdmin(email: string, passwordHash: string, tx: TransactionContext): Promise<{ id: string; email: string; role: Role }>;
  /** Devuelve el nombre de una sede existente o crea una con `name` (sin sede no se pueden registrar empleados). */
  abstract ensureSite(name: string, tx: TransactionContext): Promise<string>;
}
