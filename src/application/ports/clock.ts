/** Abstracción del reloj para que las reglas de vigencia sean testeables. */
export interface Clock {
  now(): Date;
  /** Fecha de hoy en formato ISO (YYYY-MM-DD). */
  today(): string;
}
