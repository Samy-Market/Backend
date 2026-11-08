import { Injectable } from '@nestjs/common';
import { AuditLog } from '../../../shared/application/ports/audit-log';
import { Clock } from '../../../shared/application/ports/clock';
import { PasswordHasher } from '../../../shared/application/ports/password-hasher';
import { RealtimeNotifier } from '../../../shared/application/ports/realtime-notifier';
import { UnitOfWork } from '../../../shared/application/ports/unit-of-work';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/errors';
import { SiteRepository } from '../../sites/application/ports/site.repository';
import { scheduleSummary } from '../domain/employee';
import { EmployeeChanges, EmployeeFilter, EmployeeRepository, EmployeeWithAssignments } from './ports/employee.repository';

export interface EmployeeInput {
  fullName: string;
  email: string;
  documentId: string;
  position: string;
  siteId: string;
  active?: boolean;
  password: string;
}

/** Casos de uso de la ficha de empleados. */
@Injectable()
export class EmployeesService {
  constructor(
    private employees: EmployeeRepository,
    private sites: SiteRepository,
    private uow: UnitOfWork,
    private audit: AuditLog,
    private clock: Clock,
    private hasher: PasswordHasher,
    private realtime: RealtimeNotifier,
  ) {}

  async list(filter: EmployeeFilter) {
    const today = this.clock.today();
    const rows = await this.employees.list(filter, today);
    return rows.map((e) => withSchedule(e, today));
  }

  async get(id: string) {
    const today = this.clock.today();
    const employee = await this.employees.findById(id, today);
    if (!employee) throw new NotFoundError('Empleado no encontrado.');
    return withSchedule(employee, today);
  }

  async create(input: EmployeeInput, actorId: string) {
    await this.assertActiveSite(input.siteId);
    const passwordHash = await this.hasher.hash(input.password);
    const { password: _p, ...data } = input;
    const created = await this.uow.run(async (tx) => {
      const employee = await this.employees.create({ ...data, active: input.active ?? true, passwordHash }, tx);
      await this.audit.record({ userId: actorId, action: 'CREATE', entity: 'Employee', entityId: employee.id, after: employee }, tx);
      return employee;
    });
    return this.get(created.id);
  }

  async update(id: string, input: Partial<EmployeeInput>, actorId: string) {
    const before = await this.get(id);
    if (before.user.id === actorId && input.active === false) {
      throw new BusinessRuleError('No puedes desactivar tu propio usuario.');
    }
    if (input.siteId && input.siteId !== before.siteId) await this.assertActiveSite(input.siteId);
    const { password, ...rest } = input;
    const changes: EmployeeChanges = { ...rest, passwordHash: password ? await this.hasher.hash(password) : undefined };

    const updated = await this.uow.run(async (tx) => {
      const employee = await this.employees.update(id, before.user.id, changes, tx);
      const action = changes.passwordHash ? 'UPDATE_WITH_PASSWORD_RESET' : 'UPDATE';
      await this.audit.record({ userId: actorId, action, entity: 'Employee', entityId: id, before, after: employee }, tx);
      return employee;
    });
    // Un usuario desactivado pierde también su conexión en vivo.
    if (input.active === false) this.realtime.disconnectUser(before.user.id);
    return updated;
  }

  /** La sede debe existir y estar activa. */
  private async assertActiveSite(siteId: string) {
    const site = await this.sites.findById(siteId);
    if (!site) throw new BusinessRuleError('La sede seleccionada no existe. Crea las sedes primero en la sección Sedes.');
    if (!site.active) throw new BusinessRuleError(`La sede "${site.name}" está desactivada.`);
  }
}

function withSchedule({ assignments, ...employee }: EmployeeWithAssignments, today: string) {
  return { ...employee, ...scheduleSummary(assignments, today) };
}
