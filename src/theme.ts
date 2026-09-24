export const colors = {
  bg: "#F3F6F4",
  surface: "#FFFFFF",
  ink: "#13261C",
  muted: "#5C6B63",
  line: "#E1E8E4",
  primary: "#0E6B4F",
  primaryDark: "#0A4634",
  cold: "#0C6478",
  coldSoft: "#E5F4F7",
  primarySoft: "#E7F5EF",
  danger: "#9B2C2C",
  dangerSoft: "#FDECEC",
  warning: "#8A5A12",
  warningSoft: "#FFF6E8",
  white: "#FFFFFF",
};

export function statusTone(status: string): { background: string; color: string } {
  const danger = ["EXCEPTION", "FAILED", "CANCELLED", "REJECTED", "CONFLICT"];
  const warning = ["PENDING", "ESCROW_PENDING", "DRAFT", "OPEN", "ASSIGNED", "IN_PROGRESS", "RELEASE_REQUESTED", "PROCESSING"];
  const cold = ["IN_TRANSIT", "COLLECTION_SCHEDULED", "SCHEDULED", "ESCROW_FUNDED", "FUNDED", "FIELD_CONFIRMED", "ALLOCATED", "COMMITTED"];
  if (danger.includes(status)) return { background: colors.dangerSoft, color: colors.danger };
  if (warning.includes(status)) return { background: colors.warningSoft, color: colors.warning };
  if (cold.includes(status)) return { background: colors.coldSoft, color: colors.cold };
  return { background: colors.primarySoft, color: colors.primary };
}
