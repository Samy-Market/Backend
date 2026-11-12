import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '../../../config/app.config';
import { BusinessRuleError } from '../../../shared/domain/errors';
import { describeTarget, redact } from '../domain/audit-view';
import { AuditReader } from './ports/audit-reader';

const PAGE = 50;

@Injectable()
export class AuditService {
  constructor(private reader: AuditReader) {}

  async list(q: { entity?: string; userId?: string; from?: string; to?: string; cursor?: string }) {
    const from = q.from ? DateTime.fromISO(q.from, { zone: APP_TIMEZONE }).startOf('day') : null;
    const to = q.to ? DateTime.fromISO(q.to, { zone: APP_TIMEZONE }).plus({ days: 1 }).startOf('day') : null;
    if ((from && !from.isValid) || (to && !to.isValid)) throw new BusinessRuleError('Rango de fechas inválido.');
    if (from && to && to <= from) throw new BusinessRuleError('La fecha final no puede ser anterior a la inicial.');

    const rows = await this.reader.list({
      entity: q.entity,
      userId: q.userId,
      from: from?.toJSDate(),
      to: to?.toJSDate(),
      cursor: q.cursor,
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((r) => ({
        ...r,
        before: redact(r.before),
        after: redact(r.after),
        target: describeTarget(r.before, r.after),
      })),
      nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    };
  }

  async filters() {
    const [entities, users] = await Promise.all([this.reader.entities(), this.reader.authors()]);
    return { entities, users };
  }
}
