export const colors = {
  bg: "#F2F5F3",
  surface: "#FFFFFF",
  surfaceMuted: "#F7FAF8",
  ink: "#102119",
  muted: "#5C6D64",
  faint: "#8A9A92",
  line: "#E3EAE6",
  lineStrong: "#D3DDD7",
  primary: "#0C6B4D",
  primaryDark: "#084833",
  primarySoft: "#E6F4EE",
  cold: "#0E6474",
  coldSoft: "#E6F3F6",
  danger: "#8E2F2F",
  dangerSoft: "#FBECEC",
  warning: "#8A5A12",
  warningSoft: "#FFF6E8",
  white: "#FFFFFF",
  sidebar: "#101816",
  sidebarText: "#C9D6D0",
  sidebarMuted: "#7E9188",
};

export const shadow = {
  card: {
    shadowColor: "#102119",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
};

export function statusTone(status: string): { background: string; color: string; dot: string } {
  const danger = ["EXCEPTION", "FAILED", "CANCELLED", "REJECTED", "CONFLICT"];
  const warning = ["PENDING", "ESCROW_PENDING", "DRAFT", "OPEN", "ASSIGNED", "IN_PROGRESS", "RELEASE_REQUESTED", "PROCESSING"];
  const cold = ["IN_TRANSIT", "COLLECTION_SCHEDULED", "SCHEDULED", "ESCROW_FUNDED", "FUNDED", "FIELD_CONFIRMED", "ALLOCATED", "COMMITTED"];
  if (danger.includes(status)) return { background: colors.dangerSoft, color: colors.danger, dot: colors.danger };
  if (warning.includes(status)) return { background: colors.warningSoft, color: colors.warning, dot: colors.warning };
  if (cold.includes(status)) return { background: colors.coldSoft, color: colors.cold, dot: colors.cold };
  return { background: colors.primarySoft, color: colors.primary, dot: colors.primary };
}
