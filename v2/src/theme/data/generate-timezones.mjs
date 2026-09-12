import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Only these source sections describe naming compatibility. The intervening
// clock-equivalence sections are not evidence of geographic equivalence.
const aliasSections = [
  ["Pre-1993 naming conventions", "Two-part names that were renamed mostly to three-part names in 1995"],
  ["Two-part names that were renamed mostly to three-part names in 1995", "Pre-2013 practice, which typically had a Zone per zone.tab line"],
  ["Alternate names for the same location", "The backward-compatibility zones PST8PDT, MST7MDT, CST6CDT, and EST5EDT"],
];

export function generateTimezones(sources) {
  const version = sources.version.trim();
  if (!/^\d{4}[a-z]+$/.test(version)) throw new Error("Expected a released IANA tzdata version");

  const coordinates = new Map();
  const sourceHashes = [];
  for (const name of ["zone1970.tab", "zone.tab"]) {
    const source = sources[name];
    sourceHashes.push(`${name} SHA256 ${createHash("sha256").update(source).digest("hex")}`);
    for (const line of source.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const [, position, zone] = line.split("\t");
      if (!zone || !position) throw new Error(`Invalid ${name} row`);
      if (coordinates.has(zone)) continue;
      const parts = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/.exec(position);
      if (!parts) throw new Error(`Invalid coordinates for ${zone}`);
      const [, latSign, latDeg, latMin, latSec, lonSign, lonDeg, lonMin, lonSec] = parts;
      const decimal = (sign, degrees, minutes, seconds) => {
        if (+minutes >= 60 || +(seconds ?? 0) >= 60) throw new Error(`Invalid coordinates for ${zone}`);
        return +((+degrees + +minutes / 60 + +(seconds ?? 0) / 3600) * (sign === "-" ? -1 : 1)).toFixed(6);
      };
      const value = [decimal(latSign, latDeg, latMin, latSec), decimal(lonSign, lonDeg, lonMin, lonSec)];
      if (Math.abs(value[0]) > 90 || Math.abs(value[1]) > 180) throw new Error(`Out-of-range coordinates for ${zone}`);
      coordinates.set(zone, value);
    }
  }

  const backward = sources.backward;
  sourceHashes.push(`backward SHA256 ${createHash("sha256").update(backward).digest("hex")}`);
  const normalizedBackward = backward.replace(/\r\n/g, "\n");
  const links = aliasSections.flatMap(([heading, nextHeading]) => {
    const start = normalizedBackward.indexOf(`# ${heading}\n`);
    const end = normalizedBackward.indexOf(`# ${nextHeading}\n`);
    if (start < 0 || end <= start) throw new Error("IANA backward sections changed; review geographic alias policy");
    return [...normalizedBackward.slice(start, end).matchAll(/^Link[^\S\r\n]+(\S+)[^\S\r\n]+(\S+)(?:[^\S\r\n]+#=[^\S\r\n]+(\S+))?/gm)]
      // #= restores the original target before IANA flattened links to links.
      // Never fall through to the clock target if this location lacks coordinates.
      .map(([, target, alias, originalTarget]) => [originalTarget ?? target, alias]);
  });
  // Resolve chains until stable, preserving each explicit zone.tab location.
  let added;
  do {
    added = 0;
    for (const [target, alias] of links) {
      if (!coordinates.has(alias) && coordinates.has(target)) {
        coordinates.set(alias, coordinates.get(target));
        added += 1;
      }
    }
  } while (added);

  const rows = [...coordinates].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([zone, value]) => `  ${JSON.stringify(zone)}: [${value.join(", ")}],`);
  return [
    `// Generated from IANA tzdata ${version} (public domain); do not edit by hand.`,
    "// See README.md and generate-timezones.mjs in this directory.",
    ...sourceHashes.map((hash) => `// ${hash}`),
    "export const timezoneCoordinates: Readonly<Record<string, readonly [number, number]>> = {",
    ...rows,
    "};",
    "",
  ].join("\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const sourceDirectory = process.argv[2];
  if (!sourceDirectory) throw new Error("Usage: node v2/src/theme/data/generate-timezones.mjs <extracted-tzdata-directory>");
  const sources = Object.fromEntries(await Promise.all(
    ["version", "zone1970.tab", "zone.tab", "backward"].map(async (name) =>
      [name, await readFile(join(sourceDirectory, name), "utf8")]),
  ));
  const output = generateTimezones(sources);
  await writeFile(new URL("./timezone-coordinates.ts", import.meta.url), output);
  console.log(`Generated ${output.match(/^  "/gm).length} timezone coordinate entries from tzdata ${sources.version.trim()}.`);
}
