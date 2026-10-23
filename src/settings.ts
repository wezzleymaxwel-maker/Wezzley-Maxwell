export type Quality = "baixo" | "medio" | "alto";
export interface Preferences {
  sensitivity: number;
  volume: number;
  quality: Quality;
  outfit: string;
  skin: string;
}
export const DEFAULTS: Preferences = {
  sensitivity: 0.002,
  volume: 0.3,
  quality: "medio",
  outfit: "#738348",
  skin: "#9c684b",
};
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
export function validatePreferences(value: unknown): Preferences {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const color = (c: unknown, fallback: string) =>
    typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback;
  return {
    sensitivity: bounded(v.sensitivity, DEFAULTS.sensitivity, 0.0005, 0.006),
    volume: bounded(v.volume, DEFAULTS.volume, 0, 1),
    quality: ["baixo", "medio", "alto"].includes(v.quality as string)
      ? (v.quality as Quality)
      : DEFAULTS.quality,
    outfit: color(v.outfit, DEFAULTS.outfit),
    skin: color(v.skin, DEFAULTS.skin),
  };
}
export function readPreferences(): Preferences {
  try {
    return validatePreferences(
      JSON.parse(localStorage.getItem("ultima-settings") ?? "null"),
    );
  } catch {
    return { ...DEFAULTS };
  }
}
export function writePreferences(value: Preferences) {
  try {
    localStorage.setItem(
      "ultima-settings",
      JSON.stringify(validatePreferences(value)),
    );
    return true;
  } catch {
    return false;
  }
}
