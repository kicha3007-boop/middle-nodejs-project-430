// Код брони: ровно 6 символов из A-Z и 0-9. Из алфавита убраны 0, O, 1 и I — их легко
// перепутать, когда код диктуют вслух. Уникальность держит ограничение UNIQUE в базе.
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export const generateBookingCode = (): string =>
  Array.from({ length: CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

// Код из адреса приводится к виду, в котором хранится: ab12cd находит бронь AB12CD.
export const normalizeBookingCode = (code: string): string => code.trim().toUpperCase();
