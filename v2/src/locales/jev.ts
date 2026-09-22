import { jev as zhHant } from "./zh-Hant";
import { jev as en } from "./en";
import { jev as ja } from "./ja";

// Private copy uses named exports from the canonical locale modules.
// It is excluded from public navigation and public application bundles.
export interface JevContent {
  intro: string; question: string; questionHint: string; context: string; contextHint: string;
  criteria: string; criteriaHint: string; options: string; optionsHint: string;
  addContext: string; addCriterion: string; addOption: string; remove: string;
  ask: string; loading: string; ready: string; result: string; empty: string;
  yes: string; no: string; highest: string; confidence: string; score: string; between: string;
  error: string; authError: string; rateError: string; inputError: string; timeoutError: string;
  privacy: string; mode: string; language: string; home: string; skip: string; signIn: string;
  modes: Record<"noul" | "score" | "choice", string>;
}

export const jevCopy: Record<"zh-Hant" | "en" | "ja", JevContent> = { "zh-Hant": zhHant, en, ja };
