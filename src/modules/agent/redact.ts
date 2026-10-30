// Sensitive identifiers never reach the model, not even masked (CLAUDE.md rule 4, brief guardrail 2).
const PATTERNS: RegExp[] = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/gi,                 // PAN, with or without masking stars handled below
  /\b[A-Z]{5}\*{4}[A-Z]\b/gi,                 // masked PAN
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,         // Aadhaar, 12 digits, optionally spaced
  /\bX{4}\s?X{4}\s?\d{4}\b/gi,                // masked Aadhaar
  /\b\d{9,18}\b/g,                            // bank account numbers
];

export function redactSensitive(text: string): string {
  return PATTERNS.reduce((t, re) => t.replace(re, "[removed]"), text);
}

/** True when an answer states a day count or balance. Used to refuse such answers if no tool was called (numbers come from code only). */
export function statesNumbers(answer: string): boolean {
  return /\b\d+(\.\d+)?\s*(working\s+)?(days?|din)\b/i.test(answer) || /\b(CL|SL|EL|LOP)\b[^.\n]{0,30}\b\d+(\.\d+)?\b/i.test(answer)
    || /\b\d+(\.\d+)?\b[^.\n]{0,30}\b(CL|SL|EL|LOP)\b/i.test(answer);
}
