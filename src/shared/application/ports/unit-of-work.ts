/**
 * Contexto de transacción opaco: la capa de aplicación lo recibe y lo pasa a los
 * repositorios sin saber qué tecnología hay detrás.
 */
export type TransactionContext = { readonly __brand: 'TransactionContext' };

/** Ejecuta varias operaciones de forma atómica, opcionalmente serializadas por una clave. */
export abstract class UnitOfWork {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>, options?: { lockKey?: string }): Promise<T>;
}
