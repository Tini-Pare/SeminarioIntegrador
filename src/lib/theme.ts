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

export const light: ThemeColors = {
  bg: "#eeeae2",
  bgCard: "#f8f6f1",
  bgInput: "#fff",
  bgModal: "#fff",
  bgNested: "#fcfbf8",
  bgSidebar: "#191c22",
  bgNavActive: "#2f53e0",
  bgToggle: "#e9e4da",
  bgToggleActive: "#fff",
  bgTableHeader: "#efebe3",
  bgStatCard: "#f7f5f0",
  bgAreaChip: "#efebe3",
  bgLoginPanel: "#f3f0ea",
  bgMetaGrid: "#e7e2d8",
  bgBottomBar: "#fff",

  text: "#17191f",
  textSecondary: "#7b7e86",
  textMuted: "#9a9da6",
  textLabel: "#4b4e56",
  textSidebar: "#edebe6",
  textNavInactive: "#a6a9b1",

  accent: "#2f53e0",

  border: "#e2ddd3",
  borderInput: "#d8d3c9",
  borderSidebar: "#2a2e36",
  borderRow: "#ebe6dc",
  borderBottom: "#ded9cf",

  avatarBg: "#e2dcf3",
  avatarFg: "#5b3eb8",

  destructive: "#c0392b",
  success: "#1e7f47",

  eqOperational: { bg: "#d2ecdb", fg: "#1e7f47", dot: "#22a45d" },
  eqWaiting: { bg: "#f5e6cf", fg: "#8a5a15", dot: "#d9962a" },
  eqRepair: { bg: "#f5dcdc", fg: "#c0392b", dot: "#d24141" },

  faultNew: { bg: "#e2dcf3", fg: "#5b3eb8" },
  faultAssigned: { bg: "#dde3f8", fg: "#2f53e0" },
  faultInProgress: { bg: "#d7f0ec", fg: "#0f766e" },
  faultResolved: { bg: "#d2ecdb", fg: "#1e7f47" },

  urgencyLow: { bg: "#eceae4", fg: "#4b5563" },
  urgencyMedium: { bg: "#f7ecd6", fg: "#9a6512" },
  urgencyHigh: { bg: "#f8e3e3", fg: "#b23636" },

  roleAdmin: { bg: "#e2dcf3", fg: "#5b3eb8" },
  roleTechnician: { bg: "#d8ece0", fg: "#1e7f47" },
  roleUser: { bg: "#dce7f8", fg: "#2f53e0" },

  histReporte: { dot: "#5b3eb8", bg: "#e2dcf3", fg: "#5b3eb8" },
  histAsignada: { dot: "#2f53e0", bg: "#dde3f8", fg: "#2f53e0" },
  histEnCurso: { dot: "#0f766e", bg: "#d7f0ec", fg: "#0f766e" },
  histResuelta: { dot: "#1e7f47", bg: "#d2ecdb", fg: "#1e7f47" },
};

export const dark: ThemeColors = {
  bg: "#0a0c10",
  bgCard: "#14171d",
  bgInput: "#191d24",
  bgModal: "#15181f",
  bgNested: "#191d24",
  bgSidebar: "#0c0e13",
  bgNavActive: "#3b6ef5",
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

  accent: "#3b6ef5",

  border: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.09)",
  borderSidebar: "rgba(255,255,255,0.06)",
  borderRow: "rgba(255,255,255,0.04)",
  borderBottom: "rgba(255,255,255,0.08)",

  avatarBg: "#2c2447",
  avatarFg: "#c7b8f5",

  destructive: "#f87171",
  success: "#4ade80",

  eqOperational: { bg: "rgba(52,211,153,0.12)", fg: "#4ade80", dot: "#34d399" },
  eqWaiting: { bg: "rgba(251,191,36,0.13)", fg: "#fbbf24", dot: "#fbbf24" },
  eqRepair: { bg: "rgba(248,113,113,0.13)", fg: "#f87171", dot: "#f87171" },

  faultNew: { bg: "rgba(139,92,246,0.16)", fg: "#b9a6f5" },
  faultAssigned: { bg: "rgba(59,110,245,0.16)", fg: "#6f96f7" },
  faultInProgress: { bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },
  faultResolved: { bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },

  urgencyLow: { bg: "rgba(107,114,128,0.18)", fg: "#9ca3af" },
  urgencyMedium: { bg: "rgba(251,191,36,0.13)", fg: "#fbbf24" },
  urgencyHigh: { bg: "rgba(248,113,113,0.13)", fg: "#f87171" },

  roleAdmin: { bg: "rgba(139,92,246,0.16)", fg: "#b9a6f5" },
  roleTechnician: { bg: "rgba(52,211,153,0.14)", fg: "#4ade80" },
  roleUser: { bg: "rgba(96,165,250,0.14)", fg: "#7fb0ff" },

  histReporte: { dot: "#b9a6f5", bg: "rgba(139,92,246,0.16)", fg: "#b9a6f5" },
  histAsignada: { dot: "#6f96f7", bg: "rgba(59,110,245,0.16)", fg: "#6f96f7" },
  histEnCurso: { dot: "#4ade80", bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },
  histResuelta: { dot: "#4ade80", bg: "rgba(52,211,153,0.12)", fg: "#4ade80" },
};
