import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error("Usage: node v2/src/theme/data/generate-timezones.mjs <extracted-tzdata-directory>");
const version = (await readFile(join(sourceDirectory, "version"), "utf8")).trim();
if (!/^\d{4}[a-z]+$/.test(version)) throw new Error("Expected a released IANA tzdata version");

const coordinates = new Map();
const sourceHashes = [];
for (const name of ["zone1970.tab", "zone.tab"]) {
  const source = await readFile(join(sourceDirectory, name), "utf8");
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

const backward = await readFile(join(sourceDirectory, "backward"), "utf8");
sourceHashes.push(`backward SHA256 ${createHash("sha256").update(backward).digest("hex")}`);
const links = [...backward.matchAll(/^Link\s+(\S+)\s+(\S+)/gm)].map(([, target, alias]) => [target, alias]);
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
const output = [
  `// Generated from IANA tzdata ${version} (public domain); do not edit by hand.`,
  "// See README.md and generate-timezones.mjs in this directory.",
  ...sourceHashes.map((hash) => `// ${hash}`),
  "export const timezoneCoordinates: Readonly<Record<string, readonly [number, number]>> = {",
  ...rows,
  "};",
  "",
].join("\n");
await writeFile(new URL("./timezone-coordinates.ts", import.meta.url), output);
console.log(`Generated ${coordinates.size} timezone coordinate entries from tzdata ${version}.`);
