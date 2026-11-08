/**
 * Errores de negocio. El dominio y la capa de aplicación lanzan estos errores
 * sin saber nada de HTTP; el adaptador HTTP los traduce a códigos de estado.
 */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** El recurso no existe (o no es visible para quien lo pide). → 404 */
export class NotFoundError extends DomainError {}
/** Los datos no cumplen una regla de negocio. → 400 */
export class BusinessRuleError extends DomainError {}
/** Choca con el estado actual (duplicados, solapamientos). → 409 */
export class ConflictError extends DomainError {}
/** Quien lo pide no tiene permiso para esta operación. → 403 */
export class ForbiddenError extends DomainError {}
/** Credenciales o sesión inválidas. → 401 */
export class UnauthorizedError extends DomainError {}
