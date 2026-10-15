import type { Clock } from "../../application/ports/clock.js";

/** Reloj real. La fecha de corte se calcula en la zona horaria de Colombia. */
export class SystemClock implements Clock {
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(timeZone = "America/Bogota") {
    this.dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  }

  now(): Date {
    return new Date();
  }

  today(): string {
    return this.dateFormat.format(new Date());
  }
}
