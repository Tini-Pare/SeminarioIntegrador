export type ThemeColors = {
  bg: string;
  bgCard: string;
  bgInput: string;
  bgModal: string;
  bgNested: string;
  bgSidebar: string;
  bgNavActive: string;
  bgToggle: string;
  bgToggleActive: string;
  bgTableHeader: string;
  bgStatCard: string;
  bgAreaChip: string;
  bgLoginPanel: string;
  bgMetaGrid: string;
  bgBottomBar: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textLabel: string;
  textSidebar: string;
  textNavInactive: string;

  accent: string;

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
// shadows, color reserved for equipment/fault state. Palette mirrors the
// Mantia web mockups.
export const light: ThemeColors = {
  bg: "#eceeea",
  bgCard: "#fcfdfb",
  bgInput: "#f7f9f5",
  bgModal: "#fcfdfb",
  bgNested: "#f5f7f2",
  bgSidebar: "#f1f4ef",
  bgNavActive: "#2f7d5b",
  bgToggle: "#e4e9e0",
  bgToggleActive: "#fcfdfb",
  bgTableHeader: "#eef1ea",
  bgStatCard: "#f6f8f3",
  bgAreaChip: "#eef1ea",
  bgLoginPanel: "#fcfdfb",
  bgMetaGrid: "#e4e9e0",
  bgBottomBar: "#fcfdfb",

  text: "#101410",
  textSecondary: "#67705f",
  textMuted: "#949a90",
  textLabel: "#414a3f",
  textSidebar: "#101410",
  textNavInactive: "#67705f",

  accent: "#2f7d5b",

  border: "#e6ebe2",
  borderInput: "#dbe2d6",
  borderSidebar: "#e4e9e0",
  borderRow: "#edf0ea",
  borderBottom: "#e4e9e0",

  avatarBg: "#dcebdf",
  avatarFg: "#2f7d5b",

  destructive: "#963924",
  success: "#4a9b74",

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
  bgNavActive: "#2f7d5b",
  bgToggle: "#14171d",
  bgToggleActive: "#1e2330",
  bgTableHeader: "#0e1017",
  bgStatCard: "#14171d",
  bgAreaChip: "#1e2330",
  bgLoginPanel: "#0d0f14",
  bgMetaGrid: "rgba(255,255,255,0.04)",
  bgBottomBar: "#0c0e13",

  text: "#e8ebf2",
  textSecondary: "#8b94a3",
  textMuted: "#6d7684",
  textLabel: "#aab2c0",
  textSidebar: "#e8ebf2",
  textNavInactive: "#7b8494",

  accent: "#4a9b74",

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
