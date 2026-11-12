export interface AuditQuery {
  entity?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  take: number;
}

export interface AuditRow {
  id: string;
  createdAt: Date;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  user: { id: string; email: string };
}

export abstract class AuditReader {
  abstract list(q: AuditQuery): Promise<AuditRow[]>;
  abstract entities(): Promise<string[]>;
  abstract authors(): Promise<{ id: string; email: string }[]>;
}
