/** Fuente de la hora actual. Permite fijar el tiempo en pruebas. */
export abstract class Clock {
  abstract now(): Date;
  /** Día local de hoy ("yyyy-MM-dd") en la zona de la empresa. */
  abstract today(): string;
}
