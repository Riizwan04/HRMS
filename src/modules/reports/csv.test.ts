import { describe, expect, it } from "vitest";
import { csvCell, csvLine } from "./csv";

describe("CSV (L8)", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Naik, Asha "A"')).toBe('"Naik, Asha ""A"""');
    expect(csvLine(["KCF0001", "Asha", 8.5])).toBe("KCF0001,Asha,8.5");
  });
  it("neutralises spreadsheet formulas in text cells but leaves numbers alone", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell(-1)).toBe("-1");
  });
});
