// Barcode numbers: validation, and the one form Open Food Facts is asked for (EAN-13, or EAN-8)

/** True when the digits end in the right GTIN check digit (EAN-13, UPC-A, EAN-8) */
export function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  // Weights 3,1,3,1... counted from the digit just before the check digit
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** UPC-E (8 digits) expanded to the 12-digit UPC-A it stands for */
export function upcEToUpcA(upcE: string): string {
  const body = upcE.slice(1, 7);
  const last = body[5]!;
  let maker: string;
  let item: string;
  if ("012".includes(last)) [maker, item] = [body.slice(0, 2) + last + "00", "00" + body.slice(2, 5)];
  else if (last === "3") [maker, item] = [body.slice(0, 3) + "00", "000" + body.slice(3, 5)];
  else if (last === "4") [maker, item] = [body.slice(0, 4) + "0", "0000" + body[4]];
  else [maker, item] = [body.slice(0, 5), "0000" + last];
  return upcE[0]! + maker + item + upcE[7]!;
}

/** The EAN-13 (or EAN-8) form of a scanned number, or null when it is not a valid barcode number */
export function normalizeBarcode(text: string): string | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  if (t.length === 13) return hasValidCheckDigit(t) ? t : null;
  if (t.length === 12) return hasValidCheckDigit(t) ? "0" + t : null;
  if (t.length !== 8) return null;
  if (hasValidCheckDigit(t)) return t;
  // Not a valid EAN-8: a UPC-E, which Open Food Facts knows by its UPC-A (as an EAN-13)
  if (t[0] !== "0" && t[0] !== "1") return null;
  const expanded = upcEToUpcA(t);
  return hasValidCheckDigit(expanded) ? "0" + expanded : null;
}
