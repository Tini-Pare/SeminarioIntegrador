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
