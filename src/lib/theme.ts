export type ThemeColors = {
  bg: string;
  bgCard: string;
  bgInput: string;
  bgModal: string;
  bgNested: string;
  bgSidebar: string;
  bgToggle: string;
  bgToggleActive: string;
  bgTableHeader: string;
  bgStatCard: string;
  bgAreaChip: string;
  bgLoginPanel: string;
  bgMetaGrid: string;
  bgBottomBar: string;

  bgRow: string;
  bgRowAlt: string;
  bgRowHover: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textLabel: string;
  textSidebar: string;
  textNavInactive: string;

  accent: string;
  heroGradient: [string, string, string];
  heroBlobColors: [string, string];
  heroSecondaryButtonBg: string;

  border: string;
  borderInput: string;
  borderSidebar: string;
  borderRow: string;
  borderBottom: string;

  avatarBg: string;
  avatarFg: string;

  destructive: string;
  success: string;

  eqOperational: { bg: string; fg: string; dot: string };
  eqWaiting: { bg: string; fg: string; dot: string };
  eqRepair: { bg: string; fg: string; dot: string };

  faultNew: { bg: string; fg: string };
  faultAssigned: { bg: string; fg: string };
  faultInProgress: { bg: string; fg: string };
  faultResolved: { bg: string; fg: string };

  urgencyLow: { bg: string; fg: string };
  urgencyMedium: { bg: string; fg: string };
  urgencyHigh: { bg: string; fg: string };

  roleAdmin: { bg: string; fg: string };
  roleTechnician: { bg: string; fg: string };
  roleUser: { bg: string; fg: string };

  histReporte: { dot: string; bg: string; fg: string };
  histAsignada: { dot: string; bg: string; fg: string };
  histEnCurso: { dot: string; bg: string; fg: string };
  histResuelta: { dot: string; bg: string; fg: string };
};

// Green "sobria" variant: flat surfaces with hairline borders instead of
// shadows, color reserved for equipment/fault state. Palette follows the
// Westwing green range — warm cream grounds instead of pure white, sage
// for the sidebar, olive-forest green as the single action color.
export const light: ThemeColors = {
  bg: "#e8e4d6",
  bgCard: "#f3f1e8",
  bgInput: "#edeadd",
  bgModal: "#f3f1e8",
  bgNested: "#e2ded0",
  bgSidebar: "#d6dbc4",
  bgToggle: "#d8dbc7",
  bgToggleActive: "#f3f1e8",
  bgTableHeader: "#e2e5d2",
  bgStatCard: "#efede2",
  bgAreaChip: "#e0e3d1",
  bgLoginPanel: "#f3f1e8",
  bgMetaGrid: "#dddfcc",
  bgBottomBar: "#e2e5d2",

  bgRow: "#f3f1e8",
  bgRowAlt: "#e7e3d3",
  bgRowHover: "#dedac7",

  text: "#212a1e",
  textSecondary: "#59634e",
  textMuted: "#899077",
  textLabel: "#3c4635",
  textSidebar: "#212a1e",
  textNavInactive: "#59634e",

  accent: "#4f6340",
  heroGradient: ["#c7d3b3", "#e2e8d3", "#f3f1e8"],
  heroBlobColors: ["#9eaf86", "#4f6340"],
  heroSecondaryButtonBg: "rgba(255,255,255,0.6)",

  border: "#d3d1bf",
  borderInput: "#c6c6b1",
  borderSidebar: "#c3c8af",
  borderRow: "#d0cdb8",
  borderBottom: "#c3c8af",

  avatarBg: "#dce1c9",
  avatarFg: "#4f6340",

  destructive: "#963924",
  success: "#4e7b4a",

  eqOperational: { bg: "#e5f1e8", fg: "#2c6a4e", dot: "#4a9b74" },
  eqWaiting: { bg: "#f7efdb", fg: "#8a5d12", dot: "#c99433" },
  eqRepair: { bg: "#f7e7e1", fg: "#963924", dot: "#c2503f" },

  faultNew: { bg: "#e6efe1", fg: "#4a7434" },
  faultAssigned: { bg: "#dfeae4", fg: "#2f7d5b" },
  faultInProgress: { bg: "#dcece9", fg: "#12706a" },
  faultResolved: { bg: "#dcecdf", fg: "#256a4e" },

  urgencyLow: { bg: "#eceae4", fg: "#5a6154" },
  urgencyMedium: { bg: "#f4eddc", fg: "#8a5d12" },
  urgencyHigh: { bg: "#f5e2dd", fg: "#963924" },

  roleAdmin: { bg: "#dfeae4", fg: "#2f7d5b" },
  roleTechnician: { bg: "#e6efe1", fg: "#4a7434" },
  roleUser: { bg: "#eceae4", fg: "#5a6154" },

  histReporte: { dot: "#4a7434", bg: "#e6efe1", fg: "#4a7434" },
  histAsignada: { dot: "#2f7d5b", bg: "#dfeae4", fg: "#2f7d5b" },
  histEnCurso: { dot: "#12706a", bg: "#dcece9", fg: "#12706a" },
  histResuelta: { dot: "#256a4e", bg: "#dcecdf", fg: "#256a4e" },
};

export const dark: ThemeColors = {
  bg: "#0a0c10",
  bgCard: "#14171d",
  bgInput: "#191d24",
  bgModal: "#15181f",
  bgNested: "#191d24",
  bgSidebar: "#0c0e13",
  bgToggle: "#14171d",
  bgToggleActive: "#1e2330",
  bgTableHeader: "#0e1017",
  bgStatCard: "#14171d",
  bgAreaChip: "#1e2330",
  bgLoginPanel: "#0d0f14",
  bgMetaGrid: "rgba(255,255,255,0.04)",
  bgBottomBar: "#0c0e13",

  bgRow: "#14171d",
  bgRowAlt: "#191d25",
  bgRowHover: "rgba(255,255,255,0.055)",

  text: "#e8ebf2",
  textSecondary: "#8b94a3",
  textMuted: "#6d7684",
  textLabel: "#aab2c0",
  textSidebar: "#e8ebf2",
  textNavInactive: "#7b8494",

  accent: "#4a9b74",
  heroGradient: ["rgba(74,155,116,0.22)", "rgba(74,155,116,0.07)", "rgba(74,155,116,0)"],
  heroBlobColors: ["#8fd4b0", "#2f7d5b"],
  heroSecondaryButtonBg: "rgba(255,255,255,0.08)",

  border: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.09)",
  borderSidebar: "rgba(255,255,255,0.06)",
  borderRow: "rgba(255,255,255,0.04)",
  borderBottom: "rgba(255,255,255,0.08)",

  avatarBg: "rgba(74,155,116,0.18)",
  avatarFg: "#8fd4b0",

  destructive: "#f0876a",
  success: "#4ade80",

  eqOperational: { bg: "rgba(52,211,153,0.12)", fg: "#4ade80", dot: "#34d399" },
  eqWaiting: { bg: "rgba(251,191,36,0.13)", fg: "#fbbf24", dot: "#fbbf24" },
  eqRepair: { bg: "rgba(248,113,113,0.13)", fg: "#f87171", dot: "#f87171" },

  faultNew: { bg: "rgba(169,201,106,0.16)", fg: "#c3dd8f" },
  faultAssigned: { bg: "rgba(74,155,116,0.16)", fg: "#8fd4b0" },
  faultInProgress: { bg: "rgba(45,212,191,0.13)", fg: "#5eead4" },
  faultResolved: { bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },

  urgencyLow: { bg: "rgba(107,114,128,0.18)", fg: "#9ca3af" },
  urgencyMedium: { bg: "rgba(251,191,36,0.13)", fg: "#fbbf24" },
  urgencyHigh: { bg: "rgba(240,135,106,0.14)", fg: "#f0876a" },

  roleAdmin: { bg: "rgba(74,155,116,0.16)", fg: "#8fd4b0" },
  roleTechnician: { bg: "rgba(169,201,106,0.16)", fg: "#c3dd8f" },
  roleUser: { bg: "rgba(107,114,128,0.18)", fg: "#a8b0a0" },

  histReporte: { dot: "#c3dd8f", bg: "rgba(169,201,106,0.16)", fg: "#c3dd8f" },
  histAsignada: { dot: "#8fd4b0", bg: "rgba(74,155,116,0.16)", fg: "#8fd4b0" },
  histEnCurso: { dot: "#5eead4", bg: "rgba(45,212,191,0.13)", fg: "#5eead4" },
  histResuelta: { dot: "#4ade80", bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },
};
