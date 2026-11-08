/** Avisos en vivo a los clientes conectados (dashboard, celulares). Solo notifica: no guarda nada. */
export abstract class RealtimeNotifier {
  abstract attendanceMarked(employeeId: string, payload: unknown): void;
  abstract justificationCreated(payload: unknown): void;
  abstract justificationReviewed(employeeId: string, payload: unknown): void;
  /** Cierra las conexiones de un usuario (p. ej. al desactivarlo o cambiar su rol). */
  abstract disconnectUser(userId: string): void;
}
