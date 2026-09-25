export const colors = {
  bg: "#FBFAF6",
  canvas: "#EEECE6",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F0EB",
  ink: "#1A2330",
  slate: "#2E3A46",
  muted: "#5B6672",
  faint: "#5B6672",
  line: "#E6E3DB",
  lineStrong: "#BAC2CC",
  primary: "#1F78B4",
  primaryDark: "#16608F",
  primarySoft: "#E8F4FB",
  cold: "#16608F",
  coldSoft: "#E8F4FB",
  green: "#2E7D32",
  greenSoft: "#E6F2E7",
  danger: "#B3261E",
  dangerSoft: "#FCE8E6",
  warning: "#8A5A00",
  warningSoft: "#FFF1D6",
  white: "#FFFFFF",
  sidebar: "#FFFFFF",
  sidebarText: "#1A2330",
  sidebarMuted: "#5B6672",
};

export const shadow = {
  card: {
    shadowColor: "#1A2330",
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
};

export function statusTone(status: string): { background: string; color: string; dot: string } {
  const alert = ["EXCEPTION", "FAILED", "CANCELLED", "REJECTED", "CONFLICT", "DECLINED"];
  const warning = ["PENDING", "ESCROW_PENDING", "DRAFT", "OPEN", "ASSIGNED", "IN_PROGRESS", "RELEASE_REQUESTED", "PROCESSING", "AWAITING_PAYMENT", "UNPAID", "SUBMITTED"];
  const info = ["IN_TRANSIT", "COLLECTION_SCHEDULED", "SCHEDULED", "ALLOCATED", "COMMITTED", "APPROVED", "IN_FULFILMENT"];
  const confirmed = ["PAID", "FUNDED", "ESCROW_FUNDED", "DELIVERED", "ACCEPTED", "SETTLED", "SYNCED", "COLLECTED", "FIELD_CONFIRMED"];
  if (alert.includes(status)) return { background: colors.dangerSoft, color: colors.danger, dot: colors.danger };
  if (warning.includes(status)) return { background: colors.warningSoft, color: colors.warning, dot: colors.warning };
  if (info.includes(status)) return { background: colors.primarySoft, color: colors.primaryDark, dot: colors.primary };
  if (confirmed.includes(status)) return { background: colors.greenSoft, color: colors.green, dot: colors.green };
  return { background: colors.surfaceMuted, color: colors.slate, dot: colors.slate };
}
