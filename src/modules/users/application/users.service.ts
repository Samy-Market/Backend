import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { assertSelfChangeAllowed, losesAdmin, mustReconnect, StaffChanges, StaffRole, staffDeletionBlocker } from '../domain/staff-user';
import { StaffUserRepository } from './ports/staff-user.repository';

@Injectable()
export class UsersService {
  constructor(
    private users: StaffUserRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private hasher: PasswordHasher,
    private realtime: RealtimeNotifier,
  ) {}

  list() {
    return this.users.list();
  }

  async create(input: { email: string; role: StaffRole; password: string; active?: boolean }, actorId: string) {
    const passwordHash = await this.hasher.hash(input.password);
    return this.uow.run(async (tx) => {
      const user = await this.users.create({ email: input.email, role: input.role, active: input.active ?? true, passwordHash }, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'User', entityId: user.id, after: user }, tx);
      return user;
    });
  }

  async update(id: string, input: StaffChanges & { password?: string }, actorId: string) {
    const before = await this.users.findStaff(id);
    if (!before) throw new NotFoundError('Usuario no encontrado. Los empleados se editan desde la sección Empleados.');
    const { password, ...changes } = input;
    assertSelfChangeAllowed(before, changes, id === actorId);
    const passwordHash = password ? await this.hasher.hash(password) : undefined;

    // El bloqueo evita que dos cambios simultáneos dejen el sistema sin administradores.
    const updated = await this.uow.run(
      async (tx) => {
        if (losesAdmin(before, changes) && (await this.users.countOtherActiveAdmins(id, tx)) === 0) {
          throw new BusinessRuleError('Debe quedar al menos un administrador activo.');
        }
        const user = await this.users.update(id, { ...changes, passwordHash }, tx);
        const action = passwordHash ? 'UPDATE_WITH_PASSWORD_RESET' : 'UPDATE';
        await this.audit.record({ userId: actorId, action, entity: 'User', entityId: id, before, after: user }, tx);
        return user;
      },
      { lockKey: 'staff-users' },
    );

    if (mustReconnect(before, changes) || passwordHash) this.realtime.disconnectUser(id);
    return updated;
  }

  async remove(id: string, actorId: string) {
    const before = await this.users.findStaff(id);
    if (!before) throw new NotFoundError('Usuario no encontrado. Los empleados se eliminan desde la sección Empleados.');
    const blocker = staffDeletionBlocker(await this.users.usage(id), id === actorId);
    if (blocker) throw new BusinessRuleError(blocker);

    await this.uow.run(
      async (tx) => {
        if (losesAdmin(before, { active: false }) && (await this.users.countOtherActiveAdmins(id, tx)) === 0) {
          throw new BusinessRuleError('Debe quedar al menos un administrador activo.');
        }
        await this.users.delete(id, tx);
        await this.audit.record({ userId: actorId, action: 'DELETE', entity: 'User', entityId: id, before }, tx);
      },
      { lockKey: 'staff-users' },
    );
    this.realtime.disconnectUser(id);
    return { deleted: true };
  }
}
