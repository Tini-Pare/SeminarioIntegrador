import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createMaintenancePlan,
  getMaintenancePlan,
  listActiveEquipmentByType,
  updateMaintenancePlan,
  type EquipmentOptionForType,
  type MaintenancePlanDetail,
} from "../lib/queries/maintenancePlans";
import { listEquipmentTypes, type EquipmentTypeWithCount } from "../lib/queries/equipmentTypes";
import { createGeneralTask, listGeneralTasks } from "../lib/queries/generalTasks";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";
import type { TareaGeneral } from "../types/database";
import {
  CustomDatePicker,
  fromDbDate,
  getTodayDateString,
  isDateWithinMax,
  isValidDateString,
  toDbDate,
} from "./CustomDatePicker";
import { FormFooter } from "./FormFooter";
import { CalendarIcon, InfoIcon, WarningIcon } from "./icons";
import { Select } from "./Select";

type ModalMode = "create" | "edit" | "view";

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

  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Form states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  const [typeName, setTypeName] = useState("");
  const [estado, setEstado] = useState<"activo" | "inactivo">("activo");

  // Options
  const [types, setTypes] = useState<EquipmentTypeWithCount[]>([]);
  const [catalogTasks, setCatalogTasks] = useState<TareaGeneral[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<TareaGeneral[]>([]);

  // Equipment date rows: key is eq_id_equipo, value is formatted date (DD/MM/YYYY)
  const [equipments, setEquipments] = useState<EquipmentOptionForType[]>([]);
  const [equipmentDates, setEquipmentDates] = useState<Record<number, string>>({});
  const [commonDate, setCommonDate] = useState("");
  const [openField, setOpenField] = useState<string | null>(null);

  // Sub-sections
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [isCreatingNewTask, setIsCreatingNewTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  // Load types & catalog tasks on modal open
  useEffect(() => {
    if (!visible) return;

    setError(null);
    setCommonDate("");
    setOpenField(null);
    setIsAddingTask(false);
    setIsCreatingNewTask(false);
    setNewTaskName("");
    setNewTaskDesc("");

    listEquipmentTypes()
      .then(setTypes)
      .catch(() => {});

    listGeneralTasks()
      .then(setCatalogTasks)
      .catch(() => {});

    if (planId) {
      setLoading(true);
      getMaintenancePlan(planId)
        .then((detail: MaintenancePlanDetail) => {
          setName(detail.name);
          setDescription(detail.description ?? "");
          setFrequency(String(detail.frequency));
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
      setTypeId(null);
      setTypeName("");
      setEstado("activo");
      setSelectedTasks([]);
      setEquipments([]);
      setEquipmentDates({});
      setLoading(false);
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
        const initialDates: Record<number, string> = {};
        const todayStr = getTodayDateString();
        items.forEach((item) => {
          initialDates[item.id] = todayStr;
        });
        setEquipmentDates(initialDates);
      })
      .catch(() => {
        setEquipments([]);
        setEquipmentDates({});
      });
  }

  // Apply common date shortcut to all equipment rows
  function handleApplyCommonDate() {
    if (!commonDate || !isValidDateString(commonDate)) return;
    const updated: Record<number, string> = {};
    equipments.forEach((eq) => {
      updated[eq.id] = commonDate;
    });
    setEquipmentDates(updated);
  }

  // Remove a task chip
  function handleRemoveTask(taskId: number) {
    if (isView) return;
    const remaining = selectedTasks.filter((t) => t.tag_id_tarea !== taskId);
    setSelectedTasks(remaining);
    // If no tasks left and active, prompt or auto adjust
    if (remaining.length === 0 && estado === "activo") {
      setEstado("inactivo");
    }
  }

  // Add an existing task from catalog
  function handleSelectCatalogTask(task: TareaGeneral) {
    if (selectedTasks.some((t) => t.tag_id_tarea === task.tag_id_tarea)) return;
    setSelectedTasks((prev) => [...prev, task]);
    setIsAddingTask(false);
    setTaskSearch("");
  }

  // Create a brand new general task and add it to plan
  async function handleCreateAndAddTask() {
    if (!newTaskName.trim()) return;
    setCreatingTask(true);
    try {
      const created = await createGeneralTask({
        name: newTaskName.trim(),
        description: newTaskDesc.trim() || null,
        estado: "activo",
      });
      setCatalogTasks((prev) => [...prev, created]);
      setSelectedTasks((prev) => [...prev, created]);
      setNewTaskName("");
      setNewTaskDesc("");
      setIsCreatingNewTask(false);
      setIsAddingTask(false);
      setTaskSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingTask(false);
    }
  }

  // Filter catalog tasks for selector
  const availableTasks = useMemo(() => {
    const selectedIds = new Set(selectedTasks.map((t) => t.tag_id_tarea));
    const q = taskSearch.trim().toLowerCase();
    return catalogTasks
      .filter((t) => !selectedIds.has(t.tag_id_tarea) && t.tag_estado === "activo")
      .filter((t) => !q || t.tag_nombre_tarea.toLowerCase().includes(q));
  }, [catalogTasks, selectedTasks, taskSearch]);

  // Validation
  const freqNum = parseInt(frequency.trim(), 10);
  const isFrequencyValid = Number.isInteger(freqNum) && freqNum > 0;
  const isNameValid = name.trim().length > 0;
  const isTypeValid = typeId !== null;
  const isTasksValid = estado === "inactivo" || selectedTasks.length > 0;

  // Equipment dates validation
  const areDatesValid = useMemo(() => {
    if (equipments.length === 0) return true;
    for (const eq of equipments) {
      const d = equipmentDates[eq.id];
      if (!d || !isValidDateString(d)) return false;
      if (!isDateWithinMax(d, new Date())) return false;
    }
    return true;
  }, [equipments, equipmentDates]);

  const isFormValid = isNameValid && isTypeValid && isFrequencyValid && isTasksValid && areDatesValid;

  async function handleSave() {
    if (!isFormValid) {
      if (!isNameValid) setError("Ingresá un nombre para el plan.");
      else if (!isTypeValid) setError("Seleccioná un tipo de equipo.");
      else if (!isFrequencyValid) setError("La frecuencia debe ser un número entero mayor a 0.");
      else if (!isTasksValid) setError("Un plan activo debe tener al menos una tarea prevista.");
      else if (!areDatesValid) setError("Verificá que todas las fechas sean válidas y no futuras.");
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
        estado,
        taskIds: selectedTasks.map((t) => t.tag_id_tarea),
        equipments: equipments.map((eq) => ({
          equipmentId: eq.id,
          lastMaintenanceDate: toDbDate(equipmentDates[eq.id] ?? getTodayDateString()),
        })),
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <CalendarIcon size={20} color={colors.accent} />
              </View>

              <View>
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
            </View>

            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Cerrar modal">
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
              {/* Field: Name */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre del plan <Text style={styles.required}>*</Text>
                </Text>

                <TextInput
                  style={[styles.input, isView && styles.inputDisabled]}
                  value={name}
                  onChangeText={setName}
                  placeholder="Ej: Mantenimiento trimestral de filtros"
                  placeholderTextColor={colors.textMuted}
                  editable={!isView}
                />
              </View>

              {/* Field Row: Tipo de equipo & Frecuencia */}
              <View style={[styles.row, openField === "type" && styles.rowRaised]}>
                <View
                  style={[
                    styles.field,
                    styles.flex1,
                    openField === "type" && styles.fieldRaised,
                  ]}
                >
                  <Text style={styles.label}>
                    Tipo de equipo <Text style={styles.required}>*</Text>
                  </Text>

                  {isCreate ? (
                    <Select
                      value={typeId}
                      onChange={handleTypeChange}
                      options={typeOptions}
                      placeholder="Seleccioná un tipo"
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
                    <Text style={styles.hint}>
                      El tipo de equipo no se puede modificar (Regla de negocio R7).
                    </Text>
                  )}
                </View>

                <View style={[styles.field, styles.flex1]}>
                  <Text style={styles.label}>
                    Frecuencia (días) <Text style={styles.required}>*</Text>
                  </Text>

                  <TextInput
                    style={[styles.input, isView && styles.inputDisabled]}
                    value={frequency}
                    onChangeText={(txt) => setFrequency(txt.replace(/[^0-9]/g, ""))}
                    placeholder="Ej: 30"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    editable={!isView}
                  />

                  {frequency.trim() !== "" && !isFrequencyValid && (
                    <Text style={styles.fieldError}>Debe ser mayor a 0</Text>
                  )}
                </View>
              </View>

              {/* Field: Descripción */}
              <View style={styles.field}>
                <Text style={styles.label}>Descripción (opcional)</Text>

                <TextInput
                  style={[styles.input, styles.multiline, isView && styles.inputDisabled]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Instrucciones generales o alcance del plan preventivo…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                  editable={!isView}
                />
              </View>

              {/* Field: Estado */}
              <View style={styles.field}>
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
                      if (selectedTasks.length === 0) {
                        setError("Para activar el plan, debés agregar al menos 1 tarea prevista.");
                        return;
                      }
                      setEstado("activo");
                      setError(null);
                    }}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: estado === "activo" ? colors.success : colors.textMuted },
                      ]}
                    />

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
                      setError(null);
                    }}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            estado === "inactivo" ? colors.textMuted : colors.border,
                        },
                      ]}
                    />

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
                    Un plan no puede quedar activo sin tareas previstas (R4).
                  </Text>
                )}
              </View>

              {/* Section: Tareas previstas */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Tareas previstas</Text>

                    <Text style={styles.sectionSubtitle}>
                      {selectedTasks.length === 0
                        ? "Sin tareas seleccionadas (requerido al menos 1 para activar)"
                        : `${selectedTasks.length} ${selectedTasks.length === 1 ? "tarea prevista" : "tareas previstas"}`}
                    </Text>
                  </View>

                  {!isView && !isAddingTask && (
                    <Pressable
                      style={styles.addTaskBtn}
                      onPress={() => setIsAddingTask(true)}
                    >
                      <Text style={styles.addTaskBtnText}>+ Agregar tarea</Text>
                    </Pressable>
                  )}
                </View>

                {/* Chips of selected tasks */}
                <View style={styles.chipsWrap}>
                  {selectedTasks.map((t) => (
                    <View key={t.tag_id_tarea} style={styles.taskChip}>
                      <Text style={styles.taskChipText}>{t.tag_nombre_tarea}</Text>

                      {!isView && (
                        <Pressable
                          style={styles.taskChipRemove}
                          onPress={() => handleRemoveTask(t.tag_id_tarea)}
                          hitSlop={6}
                        >
                          <Text style={styles.taskChipRemoveText}>✕</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>

                {/* Sub-selector for adding tasks */}
                {isAddingTask && !isView && (
                  <View style={styles.taskSelectorBox}>
                    {!isCreatingNewTask ? (
                      <>
                        <View style={styles.selectorHeader}>
                          <Text style={styles.selectorLabel}>Buscar tarea en el catálogo</Text>

                          <Pressable onPress={() => setIsAddingTask(false)}>
                            <Text style={styles.cancelLinkText}>Cancelar</Text>
                          </Pressable>
                        </View>

                        <TextInput
                          style={styles.searchInput}
                          value={taskSearch}
                          onChangeText={setTaskSearch}
                          placeholder="Filtrar por nombre de tarea…"
                          placeholderTextColor={colors.textMuted}
                          autoFocus
                        />

                        <ScrollView style={styles.taskListScroll} nestedScrollEnabled>
                          {availableTasks.length === 0 ? (
                            <View style={styles.noTasksWrap}>
                              <Text style={styles.noTasksText}>
                                No se encontraron tareas en el catálogo con ese nombre.
                              </Text>

                              <Pressable
                                style={styles.createTaskInlineBtn}
                                onPress={() => {
                                  setIsCreatingNewTask(true);
                                  setNewTaskName(taskSearch.trim());
                                }}
                              >
                                <Text style={styles.createTaskInlineBtnText}>
                                  + Crear nueva tarea: {taskSearch.trim() || "general"}
                                </Text>
                              </Pressable>
                            </View>
                          ) : (
                            availableTasks.map((t) => (
                              <Pressable
                                key={t.tag_id_tarea}
                                style={styles.taskOptionRow}
                                onPress={() => handleSelectCatalogTask(t)}
                              >
                                <View style={styles.flex1}>
                                  <Text style={styles.taskOptionName}>{t.tag_nombre_tarea}</Text>

                                  {t.tag_descripcion_tarea ? (
                                    <Text style={styles.taskOptionDesc}>
                                      {t.tag_descripcion_tarea}
                                    </Text>
                                  ) : null}
                                </View>

                                <Text style={styles.taskAddText}>+ Elegir</Text>
                              </Pressable>
                            ))
                          )}
                        </ScrollView>

                        <Pressable
                          style={styles.createTaskSecondaryBtn}
                          onPress={() => setIsCreatingNewTask(true)}
                        >
                          <Text style={styles.createTaskSecondaryBtnText}>
                            + Crear una nueva tarea general
                          </Text>
                        </Pressable>
                      </>
                    ) : (
                      /* Inline creation form for general task */
                      <View style={styles.newTaskForm}>
                        <Text style={styles.selectorLabel}>Nueva tarea general en catálogo</Text>

                        <TextInput
                          style={styles.input}
                          value={newTaskName}
                          onChangeText={setNewTaskName}
                          placeholder="Nombre de la tarea (ej: Lubricación de rodamientos)"
                          placeholderTextColor={colors.textMuted}
                        />

                        <TextInput
                          style={[styles.input, styles.multiline, { marginTop: 8 }]}
                          value={newTaskDesc}
                          onChangeText={setNewTaskDesc}
                          placeholder="Descripción del procedimiento (opcional)"
                          placeholderTextColor={colors.textMuted}
                          multiline
                        />

                        <View style={styles.newTaskBtnRow}>
                          <Pressable
                            style={styles.newTaskCancelBtn}
                            onPress={() => setIsCreatingNewTask(false)}
                          >
                            <Text style={styles.newTaskCancelBtnText}>Volver</Text>
                          </Pressable>

                          <Pressable
                            style={[
                              styles.newTaskSubmitBtn,
                              (!newTaskName.trim() || creatingTask) && styles.disabledBtn,
                            ]}
                            onPress={handleCreateAndAddTask}
                            disabled={!newTaskName.trim() || creatingTask}
                          >
                            <Text style={styles.newTaskSubmitBtnText}>
                              {creatingTask ? "Creando…" : "Crear y agregar"}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Section: Equipos y último mantenimiento */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Último mantenimiento por equipo</Text>

                    <Text style={styles.sectionSubtitle}>
                      {typeId == null
                        ? "Elegí primero un tipo de equipo"
                        : equipments.length === 0
                          ? "Este tipo de equipo aún no tiene equipos registrados"
                          : `Afecta a ${equipments.length} ${equipments.length === 1 ? "equipo" : "equipos"}`}
                    </Text>
                  </View>
                </View>

                {typeId != null && equipments.length === 0 ? (
                  <View style={styles.warningBanner}>
                    <WarningIcon size={18} color={colors.urgencyMedium.accent} />

                    <Text style={styles.warningBannerText}>
                      Este tipo aún no tiene equipos. Podés crear el plan de todas formas y los
                      equipos se asociarán al crearse.
                    </Text>
                  </View>
                ) : null}

                {equipments.length > 0 && (
                  <>
                    {/* Shortcut: Set same date for all */}
                    {!isView && (
                      <View
                        style={[
                          styles.shortcutRow,
                          openField === "commonDate" && styles.rowRaised,
                        ]}
                      >
                        <View style={styles.shortcutDateInput}>
                          <CustomDatePicker
                            value={commonDate}
                            onChange={setCommonDate}
                            placeholder="Misma fecha (dd/mm/aaaa)"
                            maxDate={new Date()}
                            compact
                            open={openField === "commonDate"}
                            onOpenChange={(o) => setOpenField(o ? "commonDate" : null)}
                          />
                        </View>

                        <Pressable
                          style={[
                            styles.applyAllBtn,
                            (!commonDate || !isValidDateString(commonDate)) && styles.disabledBtn,
                          ]}
                          onPress={handleApplyCommonDate}
                          disabled={!commonDate || !isValidDateString(commonDate)}
                        >
                          <Text style={styles.applyAllBtnText}>Aplicar a todos</Text>
                        </Pressable>
                      </View>
                    )}

                    {/* Equipment list */}
                    <View style={styles.equipTable}>
                      <View style={styles.equipTableHeader}>
                        <Text style={[styles.equipTableTh, styles.flex1]}>EQUIPO · UBICACIÓN</Text>

                        <Text style={[styles.equipTableTh, styles.equipDateCol]}>
                          ÚLTIMO MANTENIMIENTO
                        </Text>
                      </View>

                      {equipments.map((eq, idx) => {
                        const dateVal = equipmentDates[eq.id] ?? "";
                        const hasErr =
                          !dateVal ||
                          !isValidDateString(dateVal) ||
                          !isDateWithinMax(dateVal, new Date());
                        const fieldKey = `eqDate-${eq.id}`;
                        const isOpen = openField === fieldKey;

                        return (
                          <View
                            key={eq.id}
                            style={[
                              styles.equipTableRow,
                              idx % 2 === 1 && styles.equipTableRowAlt,
                              isOpen && styles.equipTableRowRaised,
                              { zIndex: equipments.length - idx + (isOpen ? 100 : 0) },
                            ]}
                          >
                            <View style={styles.flex1}>
                              <Text style={styles.equipCodeText}>
                                {eq.code}
                                <Text style={styles.equipNameText}> · {eq.name}</Text>
                              </Text>

                              <Text style={styles.equipLocText}>{eq.location}</Text>
                            </View>

                            <View style={styles.equipDateCol}>
                              {isView ? (
                                <Text style={styles.viewDateText}>{dateVal || "—"}</Text>
                              ) : (
                                <CustomDatePicker
                                  value={dateVal}
                                  onChange={(val) => {
                                    setEquipmentDates((prev) => ({ ...prev, [eq.id]: val }));
                                    if (error) setError(null);
                                  }}
                                  placeholder="dd/mm/aaaa"
                                  maxDate={new Date()}
                                  hasError={hasErr}
                                  compact
                                  open={isOpen}
                                  onOpenChange={(o) => setOpenField(o ? fieldKey : null)}
                                />
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Info Note */}
                <View style={styles.infoNoteBox}>
                  <InfoIcon size={16} color={colors.accent} />

                  <Text style={styles.infoNoteText}>
                    Próximo vencimiento = último mantenimiento + frecuencia. La OT se genera
                    automáticamente cuando llega a término.
                  </Text>
                </View>
              </View>

              {error && <Text style={styles.globalErrorText}>{error}</Text>}
            </ScrollView>
          )}

          {/* Footer Actions */}
          <View style={styles.footerWrap}>
            {isView ? (
              <Pressable style={styles.closeFullBtn} onPress={onClose}>
                <Text style={styles.closeFullBtnText}>Cerrar</Text>
              </Pressable>
            ) : (
              <FormFooter
                onCancel={onClose}
                onConfirm={handleSave}
                busy={saving}
                busyLabel={isEdit ? "Guardando…" : "Creando…"}
                disabled={!isFormValid || saving}
              />
            )}
          </View>
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
      padding: 16,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      width: "100%",
      maxWidth: 680,
      maxHeight: "92%",
      alignSelf: "center",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    headerIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.bgNested,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    subtitle: {
      fontSize: 12.5,
      color: c.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      padding: 8,
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
      padding: 24,
      gap: 16,
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
    field: {
      gap: 6,
      position: "relative",
      zIndex: 1,
    },
    row: {
      flexDirection: "row",
      gap: 16,
      position: "relative",
      zIndex: 1,
    },
    rowRaised: {
      zIndex: 100,
      elevation: 100,
    },
    fieldRaised: {
      position: "relative",
      zIndex: 100,
      elevation: 100,
    },
    flex1: {
      flex: 1,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    required: {
      color: c.destructive,
    },
    input: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgInput,
      paddingHorizontal: 12,
      fontSize: 14,
      color: c.text,
      justifyContent: "center",
    },
    inputDisabled: {
      backgroundColor: c.bgNested,
      borderColor: c.border,
    },
    disabledText: {
      fontSize: 14,
      color: c.textMuted,
    },
    multiline: {
      height: 72,
      paddingVertical: 8,
      textAlignVertical: "top",
    },
    hint: {
      fontSize: 11.5,
      color: c.textMuted,
      marginTop: 2,
    },
    fieldError: {
      fontSize: 11.5,
      color: c.destructive,
      marginTop: 2,
    },
    statusToggleRow: {
      flexDirection: "row",
      gap: 10,
    },
    statusToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
    },
    statusToggleBtnActive: {
      borderColor: c.success,
      backgroundColor: c.eqOperational.bg,
    },
    statusToggleBtnInactive: {
      borderColor: c.textMuted,
      backgroundColor: c.bgNested,
    },
    statusToggleBtnDisabled: {
      opacity: 0.8,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusToggleText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.textMuted,
    },
    statusToggleTextActive: {
      color: c.success,
    },
    statusToggleTextInactive: {
      color: c.textMuted,
    },
    sectionWrap: {
      marginTop: 6,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 10,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    sectionTitle: {
      fontSize: 14.5,
      fontWeight: "700",
      color: c.text,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 1,
    },
    addTaskBtn: {
      backgroundColor: c.bgNested,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    addTaskBtnText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    chipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minHeight: 28,
    },
    taskChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 999,
    },
    taskChipText: {
      fontSize: 12.5,
      fontWeight: "500",
      color: c.text,
    },
    taskChipRemove: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    taskChipRemoveText: {
      fontSize: 10,
      color: c.textMuted,
      lineHeight: 10,
    },
    taskSelectorBox: {
      backgroundColor: c.bgNested,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
      marginTop: 6,
    },
    selectorHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    selectorLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: c.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    cancelLinkText: {
      fontSize: 12,
      color: c.accent,
      fontWeight: "600",
    },
    searchInput: {
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bgCard,
      paddingHorizontal: 10,
      fontSize: 13,
      color: c.text,
    },
    taskListScroll: {
      maxHeight: 140,
    },
    taskOptionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    taskOptionName: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    taskOptionDesc: {
      fontSize: 11.5,
      color: c.textMuted,
      marginTop: 2,
    },
    taskAddText: {
      fontSize: 12,
      fontWeight: "700",
      color: c.accent,
    },
    noTasksWrap: {
      paddingVertical: 12,
      alignItems: "center",
      gap: 8,
    },
    noTasksText: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: "center",
    },
    createTaskInlineBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
      backgroundColor: c.accent,
    },
    createTaskInlineBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    createTaskSecondaryBtn: {
      alignItems: "center",
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    createTaskSecondaryBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: c.accent,
    },
    newTaskForm: {
      gap: 8,
    },
    newTaskBtnRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 4,
    },
    newTaskCancelBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    newTaskCancelBtnText: {
      fontSize: 12.5,
      color: c.textMuted,
    },
    newTaskSubmitBtn: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 6,
      backgroundColor: c.accent,
    },
    newTaskSubmitBtnText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    warningBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.urgencyMedium.bg,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.urgencyMedium.accent,
    },
    warningBannerText: {
      fontSize: 12.5,
      color: c.text,
      flex: 1,
    },
    shortcutRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 6,
    },
    shortcutDateInput: {
      flex: 1,
      maxWidth: 220,
    },
    applyAllBtn: {
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
    },
    applyAllBtnText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.accent,
    },
    disabledBtn: {
      opacity: 0.5,
    },
    equipTable: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      position: "relative",
      zIndex: 1,
    },
    equipTableHeader: {
      flexDirection: "row",
      backgroundColor: c.accent,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderTopLeftRadius: 9,
      borderTopRightRadius: 9,
    },
    equipTableTh: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFFFFF",
      letterSpacing: 0.5,
      fontFamily: "monospace",
    },
    equipDateCol: {
      width: 170,
    },
    equipTableRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: c.bgRow,
      borderTopWidth: 1,
      borderTopColor: c.border,
      position: "relative",
    },
    equipTableRowRaised: {
      zIndex: 100,
      elevation: 100,
    },
    equipTableRowAlt: {
      backgroundColor: c.bgRowAlt,
    },
    equipCodeText: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
    },
    equipNameText: {
      fontWeight: "400",
      color: c.textMuted,
    },
    equipLocText: {
      fontSize: 11.5,
      color: c.textMuted,
      marginTop: 2,
    },
    viewDateText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    infoNoteBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: c.bgNested,
      padding: 12,
      borderRadius: 10,
      marginTop: 4,
    },
    infoNoteText: {
      fontSize: 12,
      color: c.textMuted,
      flex: 1,
      lineHeight: 16,
    },
    globalErrorText: {
      fontSize: 13,
      color: c.destructive,
      fontWeight: "600",
      textAlign: "center",
    },
    footerWrap: {
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bgCard,
    },
    closeFullBtn: {
      backgroundColor: c.bgNested,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    closeFullBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
  });
}
