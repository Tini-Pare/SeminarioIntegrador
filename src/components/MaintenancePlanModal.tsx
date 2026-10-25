import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AddPlanTaskModal } from "./AddPlanTaskModal";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  fromDbDate,
  getTodayDateString,
  isValidDateString,
  parseDateString,
} from "./CustomDatePicker";
import { DetailModal } from "./DetailModal";
import { RowActions } from "./RowActions";
import { WarningIcon } from "./icons";
import { Select } from "./Select";
import { Tooltip } from "./Tooltip";
import { listEquipmentTypes, type EquipmentTypeWithCount } from "../lib/queries/equipmentTypes";
import {
  createMaintenancePlan,
  getMaintenancePlan,
  listActiveEquipmentByType,
  updateMaintenancePlan,
  type EquipmentOptionForType,
  type MaintenancePlanDetail,
} from "../lib/queries/maintenancePlans";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { TareaGeneral } from "../types/database";

type ModalMode = "create" | "edit" | "view";

// What a new plan starts with; matches pm_dias_aviso's column default.
const DEFAULT_WARNING_DAYS = "7";

// Calculate next due date in DD/MM/YYYY format: entered date + frequency in days
function addDaysToDateString(dateStr: string | undefined, days: number): string {
  if (!dateStr || !isValidDateString(dateStr) || !Number.isInteger(days) || days <= 0) {
    return "—";
  }
  const d = parseDateString(dateStr);
  if (!d) return "—";
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  return getTodayDateString(next);
}

export function MaintenancePlanModal({
  visible,
  onClose,
  onSaved,
  planId,
  mode = "create",
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  planId?: number | null;
  mode?: ModalMode;
}) {
  const isView = mode === "view";
  const isEdit = mode === "edit";
  const isCreate = mode === "create";
  // Each equipo's last maintenance is never typed in: a new plan starts
  // with none, and only resolving one of its preventive OTs sets it
  // (0035), so the column is read-only in every mode.

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Form states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("");
  const [warningDays, setWarningDays] = useState(DEFAULT_WARNING_DAYS);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [typeName, setTypeName] = useState("");
  const [estado, setEstado] = useState<"activo" | "inactivo">("activo");

  // Options & Selections
  const [types, setTypes] = useState<EquipmentTypeWithCount[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<TareaGeneral[]>([]);
  const [equipments, setEquipments] = useState<EquipmentOptionForType[]>([]);
  const [equipmentDates, setEquipmentDates] = useState<Record<number, string>>({});
  const [openField, setOpenField] = useState<string | null>(null);

  // Secondary modal: Agregar tarea al plan
  const [addPlanTaskOpen, setAddPlanTaskOpen] = useState(false);
  const addTaskBtnRef = useRef<View>(null);

  // View task detail modal
  const [viewingTask, setViewingTask] = useState<TareaGeneral | null>(null);

  // Discard changes confirmation
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Initial values snapshot for isDirty tracking
  const [initialSnapshot, setInitialSnapshot] = useState<{
    name: string;
    description: string;
    frequency: string;
    warningDays: string;
    typeId: number | null;
    estado: "activo" | "inactivo";
    taskIds: number[];
  }>({
    name: "",
    description: "",
    frequency: "",
    warningDays: DEFAULT_WARNING_DAYS,
    typeId: null,
    estado: "activo",
    taskIds: [],
  });

  // Load types and plan details
  useEffect(() => {
    if (!visible) return;

    setError(null);
    setOpenField(null);
    setAddPlanTaskOpen(false);
    setShowDiscardConfirm(false);

    listEquipmentTypes()
      .then(setTypes)
      .catch(() => {});

    if (planId) {
      setLoading(true);
      getMaintenancePlan(planId)
        .then((detail: MaintenancePlanDetail) => {
          setName(detail.name);
          setDescription(detail.description ?? "");
          setFrequency(String(detail.frequency));
          setWarningDays(String(detail.warningDays));
          setTypeId(detail.typeId);
          setTypeName(detail.typeName);
          setEstado(detail.estado);
          setSelectedTasks(detail.tasks);

          const eqList: EquipmentOptionForType[] = detail.equipments.map((e) => ({
            id: e.equipmentId,
            code: e.equipmentCode,
            name: e.equipmentName,
            location: e.locationName,
          }));
          setEquipments(eqList);

          const dateMap: Record<number, string> = {};
          detail.equipments.forEach((e) => {
            dateMap[e.equipmentId] = fromDbDate(e.lastMaintenanceDate);
          });
          setEquipmentDates(dateMap);

          setInitialSnapshot({
            name: detail.name,
            description: detail.description ?? "",
            frequency: String(detail.frequency),
            warningDays: String(detail.warningDays),
            typeId: detail.typeId,
            estado: detail.estado,
            taskIds: detail.tasks.map((t) => t.tag_id_tarea),
          });
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => setLoading(false));
    } else {
      // Create mode default state
      setName("");
      setDescription("");
      setFrequency("");
      setWarningDays(DEFAULT_WARNING_DAYS);
      setTypeId(null);
      setTypeName("");
      setEstado("activo");
      setSelectedTasks([]);
      setEquipments([]);
      setEquipmentDates({});
      setLoading(false);

      setInitialSnapshot({
        name: "",
        description: "",
        frequency: "",
        warningDays: DEFAULT_WARNING_DAYS,
        typeId: null,
        estado: "activo",
        taskIds: [],
      });
    }
  }, [visible, planId]);

  // When typeId changes in create mode, fetch active equipments for that type
  function handleTypeChange(newTypeId: number) {
    setTypeId(newTypeId);
    setOpenField(null);
    const foundType = types.find((t) => t.te_id === newTypeId);
    setTypeName(foundType?.te_nombre ?? "");

    listActiveEquipmentByType(newTypeId)
      .then((items) => {
        setEquipments(items);
        // No last maintenance yet: they're due as soon as the plan exists.
        setEquipmentDates({});
      })
      .catch(() => {
        setEquipments([]);
        setEquipmentDates({});
      });
  }

  // Remove task from local list
  function handleRemoveTask(taskId: number) {
    if (isView) return;
    setSelectedTasks((prev) => prev.filter((t) => t.tag_id_tarea !== taskId));
  }

  // Add task confirmed from secondary modal
  function handleTaskConfirmed(task: TareaGeneral) {
    if (selectedTasks.some((t) => t.tag_id_tarea === task.tag_id_tarea)) return;
    setSelectedTasks((prev) => [...prev, task]);
  }

  // Form modification check (isDirty)
  const isDirty = useMemo(() => {
    if (isView) return false;
    if (name !== initialSnapshot.name) return true;
    if (description !== initialSnapshot.description) return true;
    if (frequency !== initialSnapshot.frequency) return true;
    if (warningDays !== initialSnapshot.warningDays) return true;
    if (typeId !== initialSnapshot.typeId) return true;
    if (estado !== initialSnapshot.estado) return true;

    const currIds = selectedTasks
      .map((t) => t.tag_id_tarea)
      .sort()
      .join(",");
    const initIds = initialSnapshot.taskIds.slice().sort().join(",");
    if (currIds !== initIds) return true;
    return false;
  }, [
    name,
    description,
    frequency,
    warningDays,
    typeId,
    estado,
    selectedTasks,
    initialSnapshot,
    isView,
  ]);

  function handleAttemptClose() {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }

  // Form Validation
  const freqNum = parseInt(frequency.trim(), 10);
  const isFrequencyValid = Number.isInteger(freqNum) && freqNum > 0 && freqNum <= 999;
  // Shorter than the frecuencia, or the plan would be alerting the whole
  // cycle (same rule as the RPCs, 0036). Only checked once the frecuencia
  // itself is valid.
  const warningNum = parseInt(warningDays.trim(), 10);
  const isWarningValid =
    Number.isInteger(warningNum) && warningNum >= 0 && (!isFrequencyValid || warningNum < freqNum);
  const isNameValid = name.trim().length > 0;
  const isTypeValid = typeId !== null;
  const isDescriptionValid = description.trim().length > 0;
  const isTasksValid = estado === "inactivo" || selectedTasks.length > 0;

  const isFormValid =
    isNameValid &&
    isTypeValid &&
    isFrequencyValid &&
    isWarningValid &&
    isDescriptionValid &&
    isTasksValid;

  async function handleSave() {
    if (!isFormValid) {
      if (!isNameValid) setError("Ingresá un nombre para el plan.");
      else if (!isTypeValid) setError("Seleccioná un tipo de equipo.");
      else if (!isFrequencyValid)
        setError("La frecuencia debe ser un número entero entre 1 y 999.");
      else if (!isWarningValid) setError("El aviso anticipado debe ser menor que la frecuencia.");
      else if (!isDescriptionValid) setError("Ingresá una descripción para el plan.");
      else if (!isTasksValid) setError("Un plan no puede quedar activo sin tareas previstas.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        typeId: typeId!,
        name: name.trim(),
        description: description.trim() || null,
        frequency: freqNum,
        warningDays: warningNum,
        estado,
        taskIds: selectedTasks.map((t) => t.tag_id_tarea),
      };

      if (isEdit && planId) {
        await updateMaintenancePlan(planId, payload);
      } else {
        await createMaintenancePlan(payload);
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const typeOptions = useMemo(
    () => types.map((t) => ({ value: t.te_id, label: t.te_nombre })),
    [types],
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={handleAttemptClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.title}>
                  {isView
                    ? "Detalle del plan"
                    : isEdit
                      ? "Editar plan de mantenimiento"
                      : "Nuevo plan de mantenimiento"}
                </Text>

                <Text style={styles.subtitle}>
                  {isView
                    ? `${name} · ${typeName}`
                    : "Se aplica a todos los equipos del tipo elegido"}
                </Text>
              </View>

              <Pressable
                style={styles.closeBtn}
                onPress={handleAttemptClose}
                accessibilityLabel="Cerrar modal"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={colors.accent} />

                <Text style={styles.loadingText}>Cargando plan…</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Datos del plan */}
                <View style={styles.section}>
                  {/* Row 1: Nombre del plan | Tipo de equipo */}
                  <View style={[styles.formRow, openField === "type" && styles.formRowRaised]}>
                    <View style={styles.col}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>Nombre del plan</Text>

                        <Tooltip text="Campo obligatorio">
                          <Text
                            style={styles.requiredAsterisk}
                            accessibilityLabel="Campo obligatorio"
                            {...(Platform.OS === "web"
                              ? ({ title: "Campo obligatorio", cursor: "help" } as any)
                              : {})}
                          >
                            *
                          </Text>
                        </Tooltip>
                      </View>

                      <TextInput
                        style={[styles.input, isView && styles.inputDisabled]}
                        value={name}
                        onChangeText={setName}
                        placeholder="Ej: Inspección de sellos y desagüe"
                        placeholderTextColor={colors.textMuted}
                        editable={!isView}
                      />
                    </View>

                    <View style={[styles.col, openField === "type" && styles.fieldRaised]}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>Tipo de equipo</Text>

                        {isCreate && (
                          <Tooltip text="Campo obligatorio">
                            <Text
                              style={styles.requiredAsterisk}
                              accessibilityLabel="Campo obligatorio"
                              {...(Platform.OS === "web"
                                ? ({ title: "Campo obligatorio", cursor: "help" } as any)
                                : {})}
                            >
                              *
                            </Text>
                          </Tooltip>
                        )}
                      </View>

                      {isCreate ? (
                        <Select
                          value={typeId}
                          onChange={handleTypeChange}
                          options={typeOptions}
                          placeholder="Seleccionar tipo…"
                          disabled={isView}
                          open={openField === "type"}
                          onOpenChange={(o) => setOpenField(o ? "type" : null)}
                        />
                      ) : (
                        <View style={[styles.input, styles.inputDisabled]}>
                          <Text style={styles.disabledText}>{typeName || "Tipo no definido"}</Text>
                        </View>
                      )}

                      {isEdit && (
                        <Text style={styles.hintText}>
                          El tipo de equipo no se puede modificar.
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Row 2: Frecuencia (días) | Estado del plan */}
                  <View style={styles.formRow}>
                    <View style={styles.col}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>Frecuencia (días)</Text>

                        <Tooltip text="Campo obligatorio">
                          <Text
                            style={styles.requiredAsterisk}
                            accessibilityLabel="Campo obligatorio"
                            {...(Platform.OS === "web"
                              ? ({ title: "Campo obligatorio", cursor: "help" } as any)
                              : {})}
                          >
                            *
                          </Text>
                        </Tooltip>
                      </View>

                      <TextInput
                        style={[styles.input, isView && styles.inputDisabled]}
                        value={frequency}
                        onChangeText={(txt) => setFrequency(txt.replace(/[^0-9]/g, "").slice(0, 3))}
                        maxLength={3}
                        placeholder="Ej: 60"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        editable={!isView}
                      />

                      {frequency.trim() !== "" && !isFrequencyValid && (
                        <Text style={styles.fieldError}>Debe ser un número entre 1 y 999</Text>
                      )}
                    </View>

                    <View style={styles.col}>
                      <Text style={styles.label}>Estado del plan</Text>

                      <View style={styles.statusToggleRow}>
                        <Pressable
                          style={[
                            styles.statusToggleBtn,
                            estado === "activo" && styles.statusToggleBtnActive,
                            isView && styles.statusToggleBtnDisabled,
                          ]}
                          onPress={() => {
                            if (isView) return;
                            setEstado("activo");
                          }}
                        >
                          <Text
                            style={[
                              styles.statusDot,
                              { color: estado === "activo" ? colors.accent : colors.textMuted },
                            ]}
                          >
                            •
                          </Text>

                          <Text
                            style={[
                              styles.statusToggleText,
                              estado === "activo" && styles.statusToggleTextActive,
                            ]}
                          >
                            Activo
                          </Text>
                        </Pressable>

                        <Pressable
                          style={[
                            styles.statusToggleBtn,
                            estado === "inactivo" && styles.statusToggleBtnInactive,
                            isView && styles.statusToggleBtnDisabled,
                          ]}
                          onPress={() => {
                            if (isView) return;
                            setEstado("inactivo");
                          }}
                        >
                          <Text
                            style={[
                              styles.statusDot,
                              { color: estado === "inactivo" ? colors.text : colors.textMuted },
                            ]}
                          >
                            •
                          </Text>

                          <Text
                            style={[
                              styles.statusToggleText,
                              estado === "inactivo" && styles.statusToggleTextInactive,
                            ]}
                          >
                            Inactivo
                          </Text>
                        </Pressable>
                      </View>

                      {estado === "activo" && selectedTasks.length === 0 && (
                        <Text style={styles.fieldError}>
                          Un plan no puede quedar activo sin tareas previstas
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Row 2b: Aviso anticipado (SCRUM-45) */}
                  <View style={styles.formRow}>
                    <View style={styles.col}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>Aviso anticipado (días)</Text>

                        <Tooltip text="Campo obligatorio">
                          <Text
                            style={styles.requiredAsterisk}
                            accessibilityLabel="Campo obligatorio"
                            {...(Platform.OS === "web"
                              ? ({ title: "Campo obligatorio", cursor: "help" } as any)
                              : {})}
                          >
                            *
                          </Text>
                        </Tooltip>
                      </View>

                      <TextInput
                        style={[styles.input, isView && styles.inputDisabled]}
                        value={warningDays}
                        onChangeText={(txt) =>
                          setWarningDays(txt.replace(/[^0-9]/g, "").slice(0, 3))
                        }
                        maxLength={3}
                        placeholder={`Ej: ${DEFAULT_WARNING_DAYS}`}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        editable={!isView}
                      />

                      {warningDays.trim() !== "" && !isWarningValid ? (
                        <Text style={styles.fieldError}>Debe ser menor que la frecuencia</Text>
                      ) : (
                        <Text style={styles.hintText}>
                          Días antes del vencimiento en que aparece la alerta en Inicio.
                        </Text>
                      )}
                    </View>

                    <View style={styles.col} />
                  </View>

                  {/* Row 3: Descripción */}
                  <View style={styles.fieldFull}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>Descripción</Text>

                      <Tooltip text="Campo obligatorio">
                        <Text
                          style={styles.requiredAsterisk}
                          accessibilityLabel="Campo obligatorio"
                          {...(Platform.OS === "web"
                            ? ({ title: "Campo obligatorio", cursor: "help" } as any)
                            : {})}
                        >
                          *
                        </Text>
                      </Tooltip>
                    </View>

                    <TextInput
                      style={[styles.input, styles.multiline, isView && styles.inputDisabled]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Control periódico de cierres y drenaje…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={2}
                      editable={!isView}
                    />
                  </View>
                </View>

                {/* Divider line */}
                <View style={styles.divider} />

                {/* 2. Tareas previstas */}
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <View style={styles.sectionHeadingText}>
                      <Text style={styles.sectionTitle}>Tareas previstas</Text>

                      <Text style={styles.sectionSubtitle}>
                        Mínimo 1 tarea del catálogo para dejar el plan activo
                      </Text>
                    </View>

                    {!isView && (
                      <View ref={addTaskBtnRef}>
                        <Pressable
                          style={styles.addTaskBtn}
                          onPress={() => setAddPlanTaskOpen(true)}
                          accessibilityRole="button"
                        >
                          <Text style={styles.addTaskBtnText}>+ Agregar tarea</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Tasks Table or Empty State */}
                  {selectedTasks.length === 0 ? (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>
                        {'Todavía no agregaste tareas. Usá "+ Agregar tarea".'}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.table}>
                      <View style={styles.tableHeader}>
                        <Text style={[styles.headerCell, { flex: 1.4 }]}>TAREA</Text>

                        <Text style={[styles.headerCell, { flex: 2.2 }]}>DESCRIPCIÓN</Text>

                        <View style={styles.actionsCol}>
                          <Text style={styles.headerCell}>ACCIONES</Text>
                        </View>
                      </View>

                      {selectedTasks.map((t, idx) => (
                        <View
                          key={t.tag_id_tarea}
                          style={[styles.tableRow, idx % 2 === 1 && styles.rowAlt]}
                        >
                          <View style={{ flex: 1.4, paddingRight: 8 }}>
                            <Text style={styles.cellStrong}>{t.tag_nombre_tarea}</Text>
                          </View>

                          <View style={{ flex: 2.2, paddingRight: 8 }}>
                            <Text style={styles.cellDesc} numberOfLines={1}>
                              {t.tag_descripcion_tarea || "—"}
                            </Text>
                          </View>

                          <View style={styles.actionsCol}>
                            <RowActions
                              onView={() => setViewingTask(t)}
                              onDelete={
                                !isView ? () => handleRemoveTask(t.tag_id_tarea) : undefined
                              }
                              viewTooltip="Ver detalle"
                              deleteTooltip="Quitar tarea"
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {/* 3. Último mantenimiento por equipo: hidden when creating a new plan, kept when viewing or editing */}
                {!isCreate && (
                  <>
                    <View style={styles.divider} />

                    <View style={styles.section}>
                      <View style={styles.sectionHeaderRow}>
                        <View style={styles.sectionHeadingText}>
                          <Text style={styles.sectionTitle}>Último mantenimiento por equipo</Text>

                          <Text style={styles.sectionSubtitle}>
                            {typeId == null
                              ? "Elegí primero un tipo de equipo"
                              : equipments.length === 0
                                ? "Este tipo de equipo aún no tiene equipos registrados"
                                : `Afecta a ${equipments.length} ${equipments.length === 1 ? "equipo" : "equipos"} del tipo ${typeName}`}
                          </Text>
                        </View>
                      </View>

                      {typeId != null && equipments.length === 0 ? (
                        <View style={styles.warningBanner}>
                          <WarningIcon size={18} color={colors.urgencyMedium.accent} />

                          <Text style={styles.warningBannerText}>
                            Este tipo aún no tiene equipos. Podés crear el plan de todas formas y
                            los equipos se asociarán al crearse.
                          </Text>
                        </View>
                      ) : null}

                      {equipments.length > 0 && (
                        <View style={styles.table}>
                          <View style={styles.tableHeader}>
                            <Text style={[styles.headerCell, { flex: 1.8 }]}>EQUIPO</Text>

                            <Text style={[styles.headerCell, { flex: 1.3 }]}>UBICACIÓN</Text>

                            <Text style={[styles.headerCell, styles.dateCol]}>ÚLTIMO MANT.</Text>

                            <Text style={[styles.headerCell, styles.dueCol]}>PRÓX. MANT.</Text>
                          </View>

                          {equipments.map((eq, idx) => {
                            const dateVal = equipmentDates[eq.id] ?? "";
                            // No last maintenance = due now: an active plan
                            // generates its OT as soon as it's saved.
                            const dueDateStr = dateVal
                              ? addDaysToDateString(dateVal, freqNum)
                              : estado === "activo"
                                ? "Inmediato"
                                : "—";

                            return (
                              <View
                                key={eq.id}
                                style={[styles.tableRow, idx % 2 === 1 && styles.rowAlt]}
                              >
                                {/* Equipo name + code */}
                                <View style={{ flex: 1.8, paddingRight: 8 }}>
                                  <Text style={styles.cellStrong} numberOfLines={1}>
                                    {eq.name}
                                  </Text>

                                  <Text style={styles.equipCodeText} numberOfLines={1}>
                                    {eq.code}
                                  </Text>
                                </View>

                                {/* Ubicación */}
                                <View style={{ flex: 1.3, paddingRight: 8 }}>
                                  <Text style={styles.cellText} numberOfLines={1}>
                                    {eq.location}
                                  </Text>
                                </View>

                                {/* Último mantenimiento: set by its resolved preventive OTs */}
                                <View style={styles.dateCol}>
                                  <Text style={styles.cellText}>{dateVal || "Sin registro"}</Text>
                                </View>

                                {/* Próximo vencimiento calculated live */}
                                <View style={styles.dueCol}>
                                  <Text style={styles.cellText}>{dueDateStr}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* 4. Nota informativa */}
                      <Text style={styles.infoNote}>
                        Próximo vencimiento = último mantenimiento + frecuencia. Al vencer, se
                        genera sola la OT preventiva, asignada al técnico con menos tareas abiertas;
                        al resolverse, actualiza el último mantenimiento del equipo. Un equipo sin
                        registro genera su OT apenas el plan queda activo.
                      </Text>
                    </View>
                  </>
                )}

                {error && <Text style={styles.globalErrorText}>{error}</Text>}
              </ScrollView>
            )}

            {/* 5. Footer Buttons */}
            <View style={styles.footerWrap}>
              {isView ? (
                <Pressable style={styles.closeFullBtn} onPress={onClose}>
                  <Text style={styles.closeFullBtnText}>Cerrar</Text>
                </Pressable>
              ) : (
                <View style={styles.footerActions}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={handleAttemptClose}
                    disabled={saving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.confirmButton,
                      (!isFormValid || saving) && styles.confirmButtonDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={!isFormValid || saving}
                    accessibilityRole="button"
                  >
                    <Text style={styles.confirmButtonText}>
                      {saving ? (isEdit ? "Guardando…" : "Confirmando…") : "Confirmar"}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Secondary Modal: Agregar tarea al plan */}
      <AddPlanTaskModal
        visible={addPlanTaskOpen}
        planName={name}
        typeName={typeName}
        existingTaskIds={selectedTasks.map((t) => t.tag_id_tarea)}
        onClose={() => setAddPlanTaskOpen(false)}
        onConfirm={handleTaskConfirmed}
      />

      {/* Discard confirmation dialog */}
      <ConfirmDialog
        visible={showDiscardConfirm}
        title="¿Descartar los cambios?"
        message="Tenés cambios sin guardar en el plan de mantenimiento. Si salís ahora, se perderán."
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      {/* Task detail modal */}
      <DetailModal
        visible={!!viewingTask}
        onClose={() => setViewingTask(null)}
        actionTitle="Ver tarea prevista"
        title={viewingTask?.tag_nombre_tarea ?? ""}
        description={viewingTask?.tag_descripcion_tarea}
        fields={
          viewingTask
            ? [
                {
                  label: "Estado",
                  value: viewingTask.tag_estado === "inactivo" ? "Inactivo" : "Activo",
                },
              ]
            : undefined
        }
      />
    </>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      padding: 16,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      width: "100%",
      maxWidth: 780,
      maxHeight: "92%",
      alignSelf: "center",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 24,
      paddingTop: 22,
      paddingBottom: 16,
    },
    headerTextWrap: {
      flex: 1,
      gap: 3,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: c.text,
    },
    subtitle: {
      fontSize: 13,
      color: c.textMuted,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 8,
    },
    closeBtnText: {
      fontSize: 18,
      color: c.textMuted,
      lineHeight: 18,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 24,
      gap: 20,
    },
    loadingWrap: {
      padding: 48,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: c.textMuted,
    },
    section: {
      gap: 14,
    },
    formRow: {
      flexDirection: "row",
      gap: 16,
      position: "relative",
      zIndex: 1,
    },
    formRowRaised: {
      zIndex: 100,
      elevation: 100,
    },
    col: {
      flex: 1,
      gap: 6,
      position: "relative",
      zIndex: 1,
    },
    fieldFull: {
      gap: 6,
    },
    fieldRaised: {
      position: "relative",
      zIndex: 100,
      elevation: 100,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    requiredAsterisk: {
      fontSize: 14,
      fontWeight: "700",
      color: c.destructive,
      lineHeight: 14,
      paddingHorizontal: 2,
    },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      paddingHorizontal: 14,
      fontSize: 14,
      color: c.text,
    },
    inputDisabled: {
      backgroundColor: c.bgNested,
      borderColor: c.border,
      justifyContent: "center",
    },
    disabledText: {
      fontSize: 14,
      color: c.textMuted,
    },
    multiline: {
      height: 72,
      paddingVertical: 10,
      textAlignVertical: "top",
    },
    hintText: {
      fontSize: 11.5,
      color: c.textMuted,
      marginTop: 2,
    },
    fieldError: {
      fontSize: 12,
      color: c.destructive,
      marginTop: 3,
    },
    statusToggleRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
      height: 44,
    },
    statusToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgInput,
    },
    statusToggleBtnActive: {
      backgroundColor: c.eqOperational.bg,
      borderColor: c.success,
    },
    statusToggleBtnInactive: {
      backgroundColor: c.bgCard,
      borderColor: c.textMuted,
    },
    statusToggleBtnDisabled: {
      opacity: 0.6,
    },
    statusDot: {
      fontSize: 18,
      lineHeight: 18,
      fontWeight: "900",
    },
    statusToggleText: {
      fontSize: 13.5,
      fontWeight: "600",
      color: c.textMuted,
    },
    statusToggleTextActive: {
      color: c.text,
    },
    statusToggleTextInactive: {
      color: c.text,
    },
    divider: {
      height: 1,
      backgroundColor: c.borderRow,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    },
    sectionHeadingText: {
      flexShrink: 1,
      minWidth: 0,
      gap: 3,
    },
    sectionTitle: {
      fontSize: 16.5,
      fontWeight: "700",
      color: c.text,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: c.textMuted,
    },
    addTaskBtn: {
      paddingHorizontal: 14,
      height: 36,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    addTaskBtnText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 13,
    },
    emptyBox: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      fontSize: 13.5,
      color: c.textMuted,
      textAlign: "center",
    },
    table: {
      backgroundColor: c.bgCard,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      overflow: "hidden",
      position: "relative",
      zIndex: 1,
    },
    tableHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
      backgroundColor: c.accent,
      borderTopLeftRadius: 13,
      borderTopRightRadius: 13,
    },
    headerCell: {
      fontSize: 11.5,
      fontWeight: "700",
      letterSpacing: 0.5,
      textTransform: "uppercase",
      color: "#FFFFFF",
      fontFamily: "monospace",
    },
    actionsCol: {
      width: 90,
      alignItems: "center",
      justifyContent: "center",
    },
    dateCol: {
      width: 160,
    },
    dueCol: {
      width: 120,
    },
    tableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.borderRow,
      position: "relative",
    },
    rowAlt: {
      backgroundColor: c.bgRowAlt,
    },
    cellStrong: {
      fontWeight: "700",
      fontSize: 13.5,
      color: c.text,
    },
    cellDesc: {
      fontSize: 13,
      color: c.textSecondary,
    },
    cellText: {
      fontSize: 13.5,
      color: c.textLabel,
    },
    equipNameText: {
      fontSize: 13.5,
      color: c.text,
    },
    equipCodeText: {
      fontSize: 12,
      color: c.textMuted,
      fontFamily: "monospace",
      marginTop: 2,
    },

    warningBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.urgencyMedium.bg,
      borderWidth: 1,
      borderColor: c.urgencyMedium.accent,
      borderRadius: 10,
      padding: 12,
    },
    warningBannerText: {
      fontSize: 13,
      color: c.text,
      flex: 1,
    },
    infoNote: {
      fontSize: 12.5,
      color: c.textMuted,
      marginTop: 2,
      paddingHorizontal: 2,
    },
    globalErrorText: {
      color: c.destructive,
      fontSize: 13,
      backgroundColor: c.bgNested,
      padding: 12,
      borderRadius: 8,
    },
    footerWrap: {
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 24,
      paddingVertical: 16,
      backgroundColor: c.bgModal,
    },
    footerActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
    },
    cancelButton: {
      height: 44,
      paddingHorizontal: 22,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 14,
    },
    confirmButton: {
      height: 44,
      paddingHorizontal: 24,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmButtonDisabled: {
      opacity: 0.45,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    confirmButtonText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 14,
    },
    closeFullBtn: {
      height: 44,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    closeFullBtnText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 14,
    },
  });
}
