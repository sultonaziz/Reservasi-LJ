export const colors = {
  bg: "#FAFAF9",
  surface: "#FFFFFF",
  primary: "#166534",
  primaryHover: "#14532D",
  accent: "#C2410C",
  whatsapp: "#25D366",
  text: "#1C1917",
  textMid: "#44403C",
  textMute: "#78716C",
  border: "#E7E5E4",
  borderLight: "#F5F5F4",
  status: {
    draft: { bg: "#F5F5F4", text: "#44403C" },
    sent: { bg: "#EFF6FF", text: "#1D4ED8" },
    paid: { bg: "#F0FDF4", text: "#15803D" },
    overdue: { bg: "#FEF2F2", text: "#B91C1C" },
  } as Record<string, { bg: string; text: string }>,
};
