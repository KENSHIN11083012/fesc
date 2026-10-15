import { randomBytes } from "node:crypto";
import type { IdGenerator } from "../../application/ports/id-generator.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Genera identificadores ULID (26 caracteres, ordenables por tiempo), el mismo
 * formato del ejemplo del contrato ("01J...").
 */
export class UlidGenerator implements IdGenerator {
  next(): string {
    let time = Date.now();
    let timePart = "";
    for (let i = 0; i < 10; i++) {
      timePart = CROCKFORD[time % 32] + timePart;
      time = Math.floor(time / 32);
    }
    const random = randomBytes(16);
    let randomPart = "";
    for (let i = 0; i < 16; i++) randomPart += CROCKFORD[(random[i] ?? 0) % 32];
    return timePart + randomPart;
  }
}
