export type TransactionContext = { readonly __brand: 'TransactionContext' };

export abstract class UnitOfWork {
  abstract run<T>(work: (tx: TransactionContext) => Promise<T>, options?: { lockKey?: string }): Promise<T>;
}
