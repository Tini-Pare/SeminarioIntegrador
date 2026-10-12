// CUIT (Clave Única de Identificación Tributaria): 11 digits, usually
// written XX-XXXXXXXX-X. The last digit is a check digit (mod 11 over the
// first ten with fixed weights), so a typo is caught before it's saved.

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

// Digits only: "20-22725470-0" → "20227254700".
export function cuitDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCuit(raw: string): boolean {
  const digits = cuitDigits(raw);
  if (digits.length !== 11) return false;

  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

// "20227254700" → "20-22725470-0"; anything that isn't 11 digits is
// returned trimmed, untouched.
export function formatCuit(raw: string): string {
  const digits = cuitDigits(raw);
  if (digits.length !== 11) return raw.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
