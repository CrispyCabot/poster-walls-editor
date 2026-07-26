export type LengthMode = 'inches' | 'feet-inches';

/** Rounds to 2dp and strips trailing zeros, so 62.0 renders as "62". */
function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatLength(inches: number, mode: LengthMode): string {
  if (mode === 'inches') return `${trim(inches)}"`;

  const feet = Math.floor(inches / 12);
  const remainder = Math.round((inches - feet * 12) * 100) / 100;

  if (feet === 0) return `${trim(remainder)}"`;
  if (remainder === 0) return `${feet}'`;
  return `${feet}' ${trim(remainder)}"`;
}

const FEET_INCHES = /^(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)?"?$/;
const INCHES_ONLY = /^(\d+(?:\.\d+)?)"?$/;

/** Returns inches, or null when the input is not a non-negative length. */
export function parseLength(input: string): number | null {
  const text = input.trim();
  if (text === '') return null;

  const feetMatch = FEET_INCHES.exec(text);
  if (feetMatch) {
    const feet = Number(feetMatch[1]);
    const inches = feetMatch[2] === undefined ? 0 : Number(feetMatch[2]);
    return feet * 12 + inches;
  }

  const inchMatch = INCHES_ONLY.exec(text);
  if (inchMatch) return Number(inchMatch[1]);

  return null;
}
