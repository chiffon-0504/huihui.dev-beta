import { describe, expect, test } from "vitest";
import { generateTimezones } from "../../v2/src/theme/data/generate-timezones.mjs";

// Focused excerpts from the pinned IANA 2026d inputs, with the source's section
// boundaries and flattened #= links intact. No network or local archive needed.
const sources = {
  version: "2026d\n",
  "zone1970.tab": [
    "SB\t-0932+16012\tPacific/Guadalcanal",
    "PG\t-0930+14710\tPacific/Port_Moresby",
    "TW\t+2503+12130\tAsia/Taipei",
    "IN\t+2232+08822\tAsia/Kolkata",
    "US\t+404251-0740023\tAmerica/New_York",
    "CN\t+3114+12128\tAsia/Shanghai",
    "AU\t-3352+15113\tAustralia/Sydney",
  ].join("\n"),
  "zone.tab": [
    "FM\t+0658+15813\tPacific/Pohnpei",
    "FM\t+0725+15147\tPacific/Chuuk",
    "TW\t+2503+12130\tAsia/Taipei",
  ].join("\n"),
  backward: `# Pre-1993 naming conventions
Link Australia/Sydney Australia/ACT #= Australia/Canberra
Link America/New_York US/Eastern
Link Asia/Taipei ROC
# Two-part names that were renamed mostly to three-part names in 1995
# Pre-2013 practice, which typically had a Zone per zone.tab line
Link Pacific/Guadalcanal Pacific/Pohnpei
Link Pacific/Port_Moresby Pacific/Chuuk
# Non-zone.tab locations with timestamps since 1970 that duplicate
# those of an existing location
Link Australia/Sydney Australia/Canberra
Link Pacific/Port_Moresby Pacific/Yap
Link Asia/Shanghai Asia/Chongqing
# Alternate names for the same location
Link Asia/Kolkata Asia/Calcutta
Link Asia/Shanghai Asia/Chungking #= Asia/Chongqing
Link Pacific/Guadalcanal Pacific/Ponape #= Pacific/Pohnpei
Link Pacific/Port_Moresby Pacific/Truk #= Pacific/Chuuk
# The backward-compatibility zones PST8PDT, MST7MDT, CST6CDT, and EST5EDT
`,
};

function rows(output) {
  return output.split("\n").filter((line) => line.startsWith('  "'));
}

describe("v2 timezone data generation", () => {
  test("restores geographic targets from flattened links without following clock merges", () => {
    const output = generateTimezones(sources);
    expect(output).toContain('"Pacific/Ponape": [6.966667, 158.216667]');
    expect(output).toContain('"Pacific/Truk": [7.416667, 151.783333]');
    expect(output).not.toContain('"Pacific/Ponape": [-9.533333, 160.2]');
    expect(output).not.toContain('"Pacific/Truk": [-9.5, 147.166667]');
    expect(output).toContain('"Pacific/Pohnpei": [6.966667, 158.216667]');
    expect(output).toContain('"Pacific/Chuuk": [7.416667, 151.783333]');
  });

  test("preserves table coordinates, normal naming aliases and regional representatives", () => {
    const output = generateTimezones(sources);
    expect(output).toContain('"Asia/Taipei": [25.05, 121.5]');
    expect(output).toContain('"ROC": [25.05, 121.5]');
    expect(output).toContain('"Asia/Calcutta": [22.533333, 88.366667]');
    expect(output).toContain('"US/Eastern": [40.714167, -74.006389]');
  });

  test("does not invent coordinates from clock-equivalent or missing geographic targets", () => {
    const output = generateTimezones(sources);
    for (const zone of ["Pacific/Yap", "Asia/Chongqing", "Asia/Chungking", "Australia/Canberra", "Australia/ACT"]) {
      expect(output).not.toContain(`"${zone}":`);
    }
  });

  test("generation is byte-for-byte deterministic and rows are sorted", () => {
    const output = generateTimezones(sources);
    expect(generateTimezones(structuredClone(sources))).toBe(output);
    expect(rows(output)).toEqual([...rows(output)].sort());
    expect(output.match(/SHA256 [a-f0-9]{64}/g)).toHaveLength(3);
    const crlf = Object.fromEntries(Object.entries(sources).map(([name, value]) => [name, value.replaceAll("\n", "\r\n")]));
    expect(rows(generateTimezones(crlf))).toEqual(rows(output));
  });

  test("source section changes fail generation for explicit policy review", () => {
    expect(() => generateTimezones({ ...sources, backward: sources.backward.replace("Alternate names for the same location", "Changed upstream classification") }))
      .toThrow("review geographic alias policy");
  });
});
