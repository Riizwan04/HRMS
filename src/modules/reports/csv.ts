// Month-end summary CSV (L8). Quoting follows RFC 4180; cells that start with = + - @ are prefixed so Excel never runs them as formulas.
export function csvCell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvLine = (cells: (string | number)[]) => cells.map(csvCell).join(",");
