import { resolveAutoTheme } from "./auto";
import { readPreference } from "./preference";
import { resolveTimeZone } from "./timezones";

// Built as a classic external script: set the palette before parsing the body.
// The application controller owns subsequent changes, subscriptions and timers.
const preference = readPreference(window);
document.documentElement.dataset.theme = preference === "auto"
  ? resolveAutoTheme(Date.now(), resolveTimeZone()).effective
  : preference;
