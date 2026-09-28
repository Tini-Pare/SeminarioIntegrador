import type { ThemeColors } from "./theme";
import type { Solicitud } from "../types/database";

export const REQUEST_STATUS_LABELS: Record<Solicitud["status"], string> = {
  new: "Pendiente",
  assigned: "Asignada",
  in_progress: "En curso",
  resolved: "Resuelta",
};

export const REQUEST_STATUS_SUMMARIES: Record<Solicitud["status"], string> = {
  new: "Pendiente de atención",
  assigned: "Atendida · técnico asignado",
  in_progress: "Atendida · trabajo en curso",
  resolved: "Atendida · solicitud resuelta",
};

export const REQUEST_URGENCY_LABELS: Record<Solicitud["urgency"], string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

export function requestStatusColor(colors: ThemeColors, status: Solicitud["status"]) {
  const statusColors: Record<Solicitud["status"], { bg: string; fg: string }> = {
    new: colors.faultNew,
    assigned: colors.faultAssigned,
    in_progress: colors.faultInProgress,
    resolved: colors.faultResolved,
  };
  return statusColors[status] ?? colors.faultNew;
}

export function requestUrgencyColor(colors: ThemeColors, urgency: Solicitud["urgency"]) {
  const urgencyColors: Record<Solicitud["urgency"], { bg: string; fg: string }> = {
    low: colors.urgencyLow,
    medium: colors.urgencyMedium,
    high: colors.urgencyHigh,
  };
  return urgencyColors[urgency] ?? colors.urgencyMedium;
}
