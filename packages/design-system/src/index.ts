// ─── PAAX AI Design Tokens ───────────────────────────────────────────────────
// Brand-aligned design system for civil engineering AI workspace

// ─── Color Palette ───────────────────────────────────────────────────────────

export const colors = {
  /** Primary brand – deep engineering blue */
  primary: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#2563EB", // Main brand color
    600: "#1D4ED8",
    700: "#1E40AF",
    800: "#1E3A8A",
    900: "#172554",
    950: "#0F172A",
  },

  /** Secondary – warm amber for highlights and CTAs */
  secondary: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B", // Main secondary
    600: "#D97706",
    700: "#B45309",
    800: "#92400E",
    900: "#78350F",
    950: "#451A03",
  },

  /** Neutral – slate gray for text and backgrounds */
  neutral: {
    0: "#FFFFFF",
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
    950: "#020617",
  },

  /** Success – green for approvals and completed states */
  success: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },

  /** Warning – orange for cautions and anomalies */
  warning: {
    50: "#FFF7ED",
    100: "#FFEDD5",
    200: "#FED7AA",
    300: "#FDBA74",
    400: "#FB923C",
    500: "#F97316",
    600: "#EA580C",
    700: "#C2410C",
    800: "#9A3412",
    900: "#7C2D12",
  },

  /** Error / Danger – red for critical issues */
  error: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    300: "#FCA5A5",
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
    800: "#991B1B",
    900: "#7F1D1D",
  },

  /** Info – cyan for informational elements */
  info: {
    50: "#ECFEFF",
    100: "#CFFAFE",
    200: "#A5F3FC",
    300: "#67E8F9",
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0891B2",
    700: "#0E7490",
    800: "#155E75",
    900: "#164E63",
  },
} as const;

// ─── Typography Scale ────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    sans: '"Inter", "Noto Sans", system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
    display: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  },

  fontSize: {
    xs: { size: "0.75rem", lineHeight: "1rem" }, // 12px
    sm: { size: "0.875rem", lineHeight: "1.25rem" }, // 14px
    base: { size: "1rem", lineHeight: "1.5rem" }, // 16px
    lg: { size: "1.125rem", lineHeight: "1.75rem" }, // 18px
    xl: { size: "1.25rem", lineHeight: "1.75rem" }, // 20px
    "2xl": { size: "1.5rem", lineHeight: "2rem" }, // 24px
    "3xl": { size: "1.875rem", lineHeight: "2.25rem" }, // 30px
    "4xl": { size: "2.25rem", lineHeight: "2.5rem" }, // 36px
    "5xl": { size: "3rem", lineHeight: "1" }, // 48px
  },

  fontWeight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },

  letterSpacing: {
    tighter: "-0.05em",
    tight: "-0.025em",
    normal: "0em",
    wide: "0.025em",
    wider: "0.05em",
  },
} as const;

// ─── Spacing Scale ───────────────────────────────────────────────────────────

export const spacing = {
  px: "1px",
  0: "0",
  0.5: "0.125rem", // 2px
  1: "0.25rem", // 4px
  1.5: "0.375rem", // 6px
  2: "0.5rem", // 8px
  2.5: "0.625rem", // 10px
  3: "0.75rem", // 12px
  3.5: "0.875rem", // 14px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  7: "1.75rem", // 28px
  8: "2rem", // 32px
  9: "2.25rem", // 36px
  10: "2.5rem", // 40px
  12: "3rem", // 48px
  14: "3.5rem", // 56px
  16: "4rem", // 64px
  20: "5rem", // 80px
  24: "6rem", // 96px
  32: "8rem", // 128px
  40: "10rem", // 160px
  48: "12rem", // 192px
  56: "14rem", // 224px
  64: "16rem", // 256px
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────

export const borderRadius = {
  none: "0",
  sm: "0.125rem",
  DEFAULT: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  "3xl": "1.5rem",
  full: "9999px",
} as const;

// ─── Shadows ─────────────────────────────────────────────────────────────────

export const shadows = {
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
  inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
  none: "0 0 #0000",
} as const;

// ─── Chart Colors ────────────────────────────────────────────────────────────
// Distinct, accessible palette for data visualization

export const chartColors = {
  /** Categorical palette — up to 10 categories */
  categorical: [
    "#2563EB", // primary blue
    "#F59E0B", // amber
    "#10B981", // emerald
    "#EF4444", // red
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#14B8A6", // teal
    "#F97316", // orange
    "#6366F1", // indigo
    "#84CC16", // lime
  ],

  /** Sequential palette for heatmaps / intensity */
  sequential: [
    "#DBEAFE",
    "#BFDBFE",
    "#93C5FD",
    "#60A5FA",
    "#3B82F6",
    "#2563EB",
    "#1D4ED8",
    "#1E40AF",
    "#1E3A8A",
  ],

  /** Diverging palette for positive/negative deviation */
  diverging: [
    "#DC2626", // strong negative
    "#F87171",
    "#FCA5A5",
    "#FEE2E2",
    "#F1F5F9", // neutral
    "#DBEAFE",
    "#93C5FD",
    "#3B82F6",
    "#1D4ED8", // strong positive
  ],

  /** Status-specific colors for project dashboards */
  status: {
    onTrack: "#22C55E",
    atRisk: "#F59E0B",
    delayed: "#EF4444",
    notStarted: "#94A3B8",
    completed: "#2563EB",
  },

  /** Cost breakdown colors */
  costBreakdown: {
    material: "#2563EB",
    labor: "#F59E0B",
    equipment: "#10B981",
    subcontractor: "#8B5CF6",
    overhead: "#64748B",
  },
} as const;

// ─── Breakpoints ─────────────────────────────────────────────────────────────

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// ─── Z-Index Scale ───────────────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  toast: 1700,
  tooltip: 1800,
} as const;

// ─── Animation / Transition ──────────────────────────────────────────────────

export const transitions = {
  fast: "150ms cubic-bezier(0.4, 0, 0.2, 1)",
  normal: "200ms cubic-bezier(0.4, 0, 0.2, 1)",
  slow: "300ms cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;
