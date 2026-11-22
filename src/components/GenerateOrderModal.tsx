import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { listClosedCorrectiveDurations, type GenerateOrderInput } from "../lib/queries/faults";
import {
  closeTimeReference,
  formatDays,
  referenceCloseDate,
  type ClosedOrderDuration,
} from "../lib/statistics";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { Solicitud } from "../types/database";
import {
  CustomDatePicker,
  fromDbDate,
  getTodayDbDate,
  isValidDateString,
  parseDateString,
  toDbDate,
} from "./CustomDatePicker";
import { FormFooter } from "./FormFooter";
import { OrderFlowSteps } from "./OrderFlowSteps";
import { RadioGroup, type RadioOption } from "./RadioGroup";
import { useResetOnOpen } from "../lib/useResetOnOpen";

type Priority = Exclude<Solicitud["priority"], null>;

const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

// SCRUM-24: confirmation step before generating una orden_de_trabajo from a
// solicitud pendiente. The OT is created empty (just the solicitud's data,
// the prioridad and the fecha requerida de cierre); tareas, técnicos and
// falla genérica are loaded afterwards on the OT screen, where the caller
// navigates on confirm. Both fields are required and picked explicitly.
//
// The fecha requerida de cierre is the deadline the admin sets by
// availability and workload. To back it with data rather than a guess, the
// modal shows how long past correctivas of the chosen priority took to close
// (median) and prefills the date with it; the admin can change it freely.
export function GenerateOrderModal({
  visible,
  onClose,
  onConfirm,
  equipmentLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: GenerateOrderInput) => void | Promise<void>;
  equipmentLabel: string;
}) {
  const [priority, setPriority] = useState<Priority | null>(null);
  const [closeDate, setCloseDate] = useState("");
  // Once the admin touches the date, a priority change stops overwriting it.
  const [closeDateEdited, setCloseDateEdited] = useState(false);
  const [history, setHistory] = useState<ClosedOrderDuration[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const today = getTodayDbDate();
  const minDate = useMemo(() => parseDateString(fromDbDate(today)) ?? undefined, [today]);
  const reference = priority ? closeTimeReference(history, priority) : null;

  // The reference is a nice-to-have: if the history can't load, the modal
  // still works and just shows no reference.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    listClosedCorrectiveDurations()
      .then((rows) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Prefill (or follow the priority) until the admin edits the date by hand.
  useEffect(() => {
    if (!priority || closeDateEdited) return;
    const suggested = referenceCloseDate(today, closeTimeReference(history, priority).medianDays);
    setCloseDate(suggested ? fromDbDate(suggested) : "");
  }, [priority, history, closeDateEdited, today]);

  const priorityOptions: RadioOption<Priority>[] = [
    {
      value: "low",
      label: PRIORITY_LABELS.low,
      badge: {
        bg: colors.urgencyLow.bg,
        fg: colors.urgencyLow.fg,
        accent: colors.urgencyLow.accent,
      },
    },
    {
      value: "medium",
      label: PRIORITY_LABELS.medium,
      badge: {
        bg: colors.urgencyMedium.bg,
        fg: colors.urgencyMedium.fg,
        accent: colors.urgencyMedium.accent,
      },
    },
    {
      value: "high",
      label: PRIORITY_LABELS.high,
      badge: {
        bg: colors.urgencyHigh.bg,
        fg: colors.urgencyHigh.fg,
        accent: colors.urgencyHigh.accent,
      },
    },
  ];

  // Reset the form each time the modal opens.
  useResetOnOpen(visible, () => {
    setPriority(null);
    setCloseDate("");
    setCloseDateEdited(false);
    setConfirming(false);
    setError(null);
  });

  const closeDateValid = isValidDateString(closeDate) && toDbDate(closeDate) >= today;

  async function handleConfirm() {
    if (!priority) {
      setError("Elegí una prioridad.");
      return;
    }
    if (!isValidDateString(closeDate)) {
      setError("Elegí la fecha requerida de cierre.");
      return;
    }
    if (toDbDate(closeDate) < today) {
      setError("La fecha requerida de cierre no puede ser anterior a hoy.");
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await onConfirm({ priority, requiredCloseDate: toDbDate(closeDate) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  const canConfirm = !confirming && priority !== null && closeDateValid;

  const referenceText = !priority
    ? "Elegí la prioridad para ver una fecha de referencia."
    : reference && reference.medianDays !== null
      ? `Como referencia: las OT correctivas de prioridad ${PRIORITY_LABELS[priority]} se cerraron en una mediana de ${formatDays(reference.medianDays)} (${reference.closed} ${reference.closed === 1 ? "cerrada" : "cerradas"}).`
      : `Todavía no hay OT correctivas cerradas con prioridad ${PRIORITY_LABELS[priority]} para tomar de referencia.`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!confirming) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Generar Orden de Trabajo</Text>

          <Text style={styles.subtitle}>{equipmentLabel}</Text>

          <OrderFlowSteps stage="orden" style={styles.steps} compact />

          <Text style={styles.message}>
            Al confirmar, se abre la orden para cargar tareas, técnicos y falla genérica.
          </Text>

          <Text style={styles.label}>Prioridad *</Text>

          <RadioGroup
            name="ot-priority"
            value={priority}
            onChange={(p) => {
              setPriority(p);
              if (error) setError(null);
            }}
            options={priorityOptions}
            style={styles.radioGroup}
          />

          <Text style={styles.label}>Fecha requerida de cierre *</Text>

          <CustomDatePicker
            value={closeDate}
            onChange={(v) => {
              setCloseDate(v);
              setCloseDateEdited(true);
              if (error) setError(null);
            }}
            minDate={minDate}
            compact
          />

          <Text style={styles.reference}>{referenceText}</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter
            onCancel={onClose}
            onConfirm={handleConfirm}
            busy={confirming}
            busyLabel="Generando…"
            disabled={!canConfirm}
          />
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 20,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 440,
      alignSelf: "center",
    },
    title: { fontSize: 18, fontWeight: "600", color: c.text },
    subtitle: { marginTop: 2, fontSize: 13, color: c.textMuted },
    steps: { marginTop: 16 },
    message: { marginTop: 16, fontSize: 14, color: c.textLabel, lineHeight: 20 },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    radioGroup: {
      gap: 10,
    },
    reference: { marginTop: 8, fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
  });
}
