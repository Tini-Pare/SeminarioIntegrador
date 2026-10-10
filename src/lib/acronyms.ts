// Single dictionary of every sigla shown in the UI, with what it means.
// <Sigla> (components/Sigla.tsx) looks the text up here to show it as a
// tooltip on hover — add new siglas here, not inline in each screen.
export const SIGLAS: Record<string, string> = {
  OT: "Orden de trabajo",
};
