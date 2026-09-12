# Representative timezone coordinates

`timezone-coordinates.ts` is a generated, bundled coordinate table. It contains
512 timezone names from the public-domain IANA tz database release **2026d**.
It does not contain user location data, timezone boundaries, or UTC-offset rules.
The browser's `Intl` implementation continues to supply the device timezone and
civil-calendar conversion. A representative location can be far from the actual
visitor, especially in geographically large timezones; this feature intentionally
chooses an approximate theme without locating the visitor.

## Sources and reproducibility

- Archive: [IANA tzdata2026d.tar.gz](https://data.iana.org/time-zones/releases/tzdata2026d.tar.gz), retrieved 2026-09-12.
- Archive SHA-256: `0cb2aa8e333c3dc049badc42a0c61f21987b8cd44e107fa900bad764aacc7767`.
- [IANA timezone theory](https://www.iana.org/time-zones/theory) explains the
  principal locations, geographic tables, and compatibility aliases.
- The archive's `LICENSE` and source headers identify these data files as public
  domain. SHA-256 hashes of each input are recorded in the generated file header.

`generate-timezones.mjs` reads these files from an extracted official release:

1. `zone1970.tab` supplies principal-location ISO 6709 coordinates.
2. `zone.tab` supplies names absent from the first table, preserving their own
   location rather than mapping every country sharing post-1970 clock rules to
   another country's location (for example, `Atlantic/Reykjavik`).
3. `backward` supplies naming compatibility from its **Pre-1993 naming
   conventions**, **Two-part names ... renamed ... in 1995**, and **Alternate
   names for the same location** sections. Country/region names such as
   `US/Eastern` use their named representative location. The clock-merger
   sections (**Pre-2013 practice** and **Non-zone.tab locations**) do not supply
   geographic aliases. Explicit table coordinates always win.
4. Within the naming sections, `#= TARGET1` restores the original target before
   IANA flattened links to links for older parsers. Thus `Pacific/Ponape` uses
   the explicit `Pacific/Pohnpei` coordinates (`6.966667, 158.216667`), and
   `Pacific/Truk` uses `Pacific/Chuuk` (`7.416667, 151.783333`). Their flattened
   clock targets, Guadalcanal and Port Moresby, are different places. Naming
   chains resolve only through these approved links to a table-backed point.

Timezone rule aliasing is not geographic aliasing. If a naming target has no
coordinate in either table, generation leaves it unsupported; it never retries
the flattened clock target. For example, `Asia/Chungking` points to Chongqing,
whose coordinates are absent from these release tables, rather than Shanghai.
This removes 37 previously guessed entries (including `Pacific/Yap` and
`Australia/Canberra`); they now use Auto's existing deterministic Light fallback.
No runtime exceptions or new coordinate guesses are introduced. `backzone`
contains historical clock definitions, not an alternative coordinate table.

Coordinates are converted to decimal degrees, rounded to six decimal places and
sorted by timezone name. Non-geographic names with no table-backed target, such
as `UTC` and `Etc/GMT-8`, remain unsupported rather than inventing coordinates.

To update, download a pinned IANA release into a temporary directory, verify its
identity and checksum, extract `version`, `zone1970.tab`, `zone.tab`, `backward`,
and `LICENSE`, then run from the repository root:

```text
node v2/src/theme/data/generate-timezones.mjs <extracted-tzdata-directory>
```

Review the generated diff, update this version/count/archive/checksum record,
and run the v2 solar/theme/generation unit tests and TypeScript check. The
generator requires the documented source section boundaries; if they change,
generation fails so the geographic policy must be reviewed with the new release.
Regenerate twice and compare with the checked-in file to verify byte-for-byte
reproducibility. Generation is an
explicit maintenance step; builds and browser startup never download data.

## Solar approximation and date contract

`../solar.ts` implements the small
[NOAA fractional-year equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF):
equation of time, solar declination, and sunrise/sunset hour angle at a 90.833°
zenith. It evaluates the seasonal terms at noon, accounts for leap years, and
returns integer UTC millisecond timestamps. It has no runtime dependency or
network API. This approximation is suitable for theme switching, not navigation
or precise astronomical observations; terrain, elevation, weather, and varying
refraction are not modeled. Tests compare Taipei summer/winter values to the
[Taipei Astronomical Museum 2026 almanac](https://www-ws.gov.taipei/001/Upload/439/relfile/21703/3425086/c82b00e6-b882-4ba8-a541-7dd65c3692ff.pdf)
(printed pages 53 and 65), with a three-minute accuracy allowance.

The input date labels a geographic solar cycle: solar noon is based on that
date's UTC midnight and longitude. It is **not** directly an IANA civil date.
The Auto resolver checks adjacent cycle dates and selects the cycle whose
`solarNoon` falls on today's calendar date in the device timezone. This is needed
for date-line zones such as `Pacific/Kiritimati` and `Pacific/Chatham`; normalizing
each event into 00:00–24:00 UTC would produce the wrong day there.

An all-day altitude above/below the standard horizon returns `polar-day` or
`polar-night`, with a solar-noon anchor even when there is no transition. Invalid
coordinates, invalid Gregorian dates, years outside the supported 1900–2100
range, or nonfinite/degenerate normal calculations return `undefined`. The Auto
service owns the deterministic Light fallback and reevaluation policy; this
calculation module never chooses or persists a theme preference.
