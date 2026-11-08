import { Injectable } from '@nestjs/common';
import { TransactionContext } from '../../../../shared/application/ports/unit-of-work';
import { db } from '../../../../shared/infrastructure/prisma/prisma-db';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AccountRepository, Profile } from '../../application/ports/account.repository';
import { Account } from '../../domain/account';

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  role: true,
  active: true,
  passwordHash: true,
  employee: { select: { id: true, active: true } },
} as const;

@Injectable()
export class PrismaAccountRepository extends AccountRepository {
  constructor(private prisma: PrismaService) {
    super();
  }

  findByEmail(email: string): Promise<Account | null> {
    return this.prisma.user.findUnique({ where: { email }, select: ACCOUNT_SELECT });
  }

  findById(id: string): Promise<Account | null> {
    return this.prisma.user.findUnique({ where: { id }, select: ACCOUNT_SELECT });
  }

  profile(id: string): Promise<Profile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
        employee: { select: { id: true, fullName: true, documentId: true, position: true, site: { select: { id: true, name: true } } } },
      },
    });
  }

  countAdmins(tx?: TransactionContext) {
    return db(this.prisma, tx).user.count({ where: { role: 'ADMIN' } });
  }

  async emailExists(email: string, tx?: TransactionContext) {
    return (await db(this.prisma, tx).user.count({ where: { email } })) > 0;
  }

  createAdmin(email: string, passwordHash: string, tx: TransactionContext) {
    return db(this.prisma, tx).user.create({ data: { email, passwordHash, role: 'ADMIN' }, select: { id: true, email: true, role: true } });
  }

  async ensureSite(name: string, tx: TransactionContext) {
    const client = db(this.prisma, tx);
    const site = (await client.site.findFirst()) ?? (await client.site.create({ data: { name } }));
    return site.name;
  }
}
