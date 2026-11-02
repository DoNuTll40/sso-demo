export const DEFAULT_SETTINGS = {
  sidebarWidth: 240, sidebarCollapsed: false, density: "comfortable",
  contentWidth: "wide", stickyHeader: true, contrast: "standard", accent: "neutral",
  animationsEnabled: true, motionDuration: 220, respectReducedMotion: true,
  accessTokenTtl: 3600, challengeTimeout: 120,
};
export function normalizeSettings(input = {}) {
  const output = {...DEFAULT_SETTINGS};
  for (const key of ["sidebarCollapsed", "stickyHeader", "animationsEnabled", "respectReducedMotion"]) {
    if (typeof input[key] === "boolean") output[key] = input[key];
  }
  for (const [key, choices] of Object.entries({density: ["compact", "comfortable"], contentWidth: ["wide", "focused"], contrast: ["standard", "high"], accent: ["neutral", "indigo", "emerald"]})) {
    if (choices.includes(input[key])) output[key] = input[key];
  }
  for (const [key, min, max] of [["sidebarWidth",180,420],["motionDuration",100,400],["accessTokenTtl",300,3600],["challengeTimeout",30,300]]) {
    if (Number.isFinite(input[key])) output[key] = Math.min(max, Math.max(min, Math.round(input[key])));
  }
  return output;
}
