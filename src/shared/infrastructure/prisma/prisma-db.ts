import { BusinessRuleError, ConflictError, NotFoundError } from '../../domain/errors';
import { Prisma } from '@prisma/client';
import { TransactionContext } from '../../application/ports/unit-of-work';
import { PrismaService } from './prisma.service';

export type Db = Prisma.TransactionClient | PrismaService;

export function db(prisma: PrismaService, tx?: TransactionContext): Db {
  return (tx as unknown as Prisma.TransactionClient | undefined) ?? prisma;
}

/** Las columnas DATE llegan como medianoche UTC: se convierten de/hacia "yyyy-MM-dd". */
export const fromDbDate = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
export const toDbDate = (key: string): Date => new Date(`${key}T00:00:00.000Z`);

export const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

const FIELD_LABELS: Record<string, string> = { documentId: 'cédula', email: 'correo', userId: 'usuario', name: 'nombre' };

export async function mapPrismaErrors<T>(op: Promise<T>): Promise<T> {
  try {
    return await op;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        const fields = (e.meta?.target as string[] | undefined)?.map((f) => FIELD_LABELS[f] ?? f);
        throw new ConflictError(
          fields?.length
            ? `Ya existe un registro con el mismo valor de ${fields.join(', ')}.`
            : 'Ya existe un registro con el mismo valor.',
        );
      }
      if (e.code === 'P2025') throw new NotFoundError('Registro no encontrado.');
      if (e.code === 'P2003') throw new BusinessRuleError('Referencia inválida a otro registro.');
    }
    throw e;
  }
}
