import type { StyleProp, ViewStyle } from "react-native";
import { StepIndicator, type Step } from "./StepIndicator";

// Where the admin is in turning a solicitud into work: review the solicitud,
// generate its orden de trabajo, then load the OT's tareas. Shown on each
// screen of that path (SolicitudDetailModal, GenerateOrderModal, the OT
// screen) so it reads as one flow, like Registrar compra's steps.
export type OrderFlowStage = "solicitud" | "orden" | "tareas";

const STAGES: { stage: OrderFlowStage; label: string }[] = [
  { stage: "solicitud", label: "Solicitud" },
  { stage: "orden", label: "Orden de trabajo" },
  { stage: "tareas", label: "Tareas" },
];

export function OrderFlowSteps({
  stage,
  style,
  compact,
}: {
  stage: OrderFlowStage;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const current = STAGES.findIndex((s) => s.stage === stage);
  const steps: Step[] = STAGES.map((s, i) => ({
    label: s.label,
    state: i < current ? "done" : i === current ? "current" : "upcoming",
  }));
  return <StepIndicator steps={steps} style={style} compact={compact} />;
}
