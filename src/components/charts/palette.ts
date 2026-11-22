// Chart series colors for Estadísticas. Validated with the dataviz skill's
// palette checker against the card surface (bgCard #f3f1e8): order matters,
// adjacent pairs are what's checked, so keep each list in this order.
// The amber (#c08a1e) is under 3:1 against the card, which is why every
// stacked chart ships a legend and shows its numbers as text.

export type ChartSeries = { key: string; label: string; color: string };

export const ORDER_TYPE_SERIES: ChartSeries[] = [
  { key: "correctivo", label: "Correctivas", color: "#c2703f" },
  { key: "preventivo", label: "Preventivas", color: "#4a7fb5" },
];

export const REQUEST_STATUS_SERIES: ChartSeries[] = [
  { key: "resolved", label: "Resueltas", color: "#2e8b62" },
  { key: "pending", label: "Pendientes", color: "#c08a1e" },
  { key: "inProgress", label: "En curso", color: "#4a7fb5" },
  { key: "rejected", label: "Rechazadas", color: "#b8483a" },
];

// For a falla without a gravedad (or "Sin tipo de falla").
export const NEUTRAL_BAR = "#9b9886";
