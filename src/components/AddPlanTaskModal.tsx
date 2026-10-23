import { useEffect, useRef, useState } from "react";
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
import { searchGeneralTasks } from "../lib/queries/generalTasks";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { TareaGeneral } from "../types/database";

export function AddPlanTaskModal({
  visible,
  planName = "",
  typeName = "",
  existingTaskIds,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  planName?: string;
  typeName?: string;
  existingTaskIds: number[];
  onClose: () => void;
  onConfirm: (task: TareaGeneral) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TareaGeneral[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TareaGeneral | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const inputRef = useRef<TextInput>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Subtitle showing plan name and equipment type, omitted if empty
  const subtitle = [planName.trim(), typeName.trim()].filter(Boolean).join(" · ");

  // Reset modal state on open
  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setResults([]);
    setSearching(false);
    setSelectedTask(null);
    setHighlightedIndex(-1);
  }, [visible]);

  // Debounced search when query length >= 2
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setHighlightedIndex(-1);
      return;
    }

    // Do not re-search if user just picked a selected task and the input has its exact name
    if (selectedTask && selectedTask.tag_nombre_tarea === trimmed) {
      return;
    }

    setSearching(true);
    const timer = setTimeout(() => {
      searchGeneralTasks(trimmed, 8)
        .then((items) => {
          setResults(items);
          setHighlightedIndex(-1);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => {
          setSearching(false);
        });
    }, 250);

    return () => clearTimeout(timer);
  }, [search, selectedTask]);

  const existingSet = new Set(existingTaskIds);

  function handleSelect(task: TareaGeneral) {
    if (existingSet.has(task.tag_id_tarea)) return;
    setSelectedTask(task);
    setSearch(task.tag_nombre_tarea);
  }

  function handleConfirm() {
    if (!selectedTask) return;
    onConfirm(selectedTask);
    onClose();
  }

  // Keyboard navigation for web
  function handleKeyDown(e: any) {
    if (Platform.OS !== "web") return;
    const key = e.nativeEvent?.key || e.key;

    const selectableItems = results.filter((r) => !existingSet.has(r.tag_id_tarea));
    if (selectableItems.length === 0) return;

    if (key === "ArrowDown") {
      e.preventDefault?.();
      setHighlightedIndex((prev) => (prev + 1 < selectableItems.length ? prev + 1 : 0));
    } else if (key === "ArrowUp") {
      e.preventDefault?.();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : selectableItems.length - 1));
    } else if (key === "Enter") {
      e.preventDefault?.();
      if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
        handleSelect(selectableItems[highlightedIndex]);
      } else if (selectedTask) {
        handleConfirm();
      }
    } else if (key === "Escape") {
      e.preventDefault?.();
      onClose();
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Agregar tarea al plan</Text>

          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <Text style={styles.label}>Buscar tarea del catálogo</Text>

          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            value={search}
            onChangeText={(txt) => {
              setSearch(txt);
              if (selectedTask && selectedTask.tag_nombre_tarea !== txt) {
                setSelectedTask(null);
              }
            }}
            placeholder="Buscar por nombre o descripción…"
            placeholderTextColor={colors.textMuted}
            autoFocus
            onKeyPress={handleKeyDown}
          />

          {/* Results container */}
          <View style={styles.resultsContainer}>
            {search.trim().length < 2 ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>Escribí al menos 2 letras para buscar</Text>
              </View>
            ) : searching ? (
              <View style={styles.messageBox}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : results.length === 0 ? (
              <View style={styles.messageBox}>
                <Text style={styles.messageText}>No se encontraron tareas con ese nombre.</Text>
              </View>
            ) : (
              <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
                {results.map((task) => {
                  const alreadyInPlan = existingSet.has(task.tag_id_tarea);
                  const isSelected = selectedTask?.tag_id_tarea === task.tag_id_tarea;

                  if (alreadyInPlan) {
                    return (
                      <View key={task.tag_id_tarea} style={styles.resultRowDisabled}>
                        <View style={styles.resultTextWrap}>
                          <Text style={styles.resultNameDisabled}>{task.tag_nombre_tarea}</Text>

                          {task.tag_descripcion_tarea ? (
                            <Text style={styles.resultDescDisabled} numberOfLines={2}>
                              {task.tag_descripcion_tarea}
                            </Text>
                          ) : null}
                        </View>

                        <Text style={styles.alreadyBadge}>Ya en el plan</Text>
                      </View>
                    );
                  }

                  return (
                    <Pressable
                      key={task.tag_id_tarea}
                      style={[
                        styles.resultRow,
                        isSelected && styles.resultRowSelected,
                      ]}
                      onPress={() => handleSelect(task)}
                      accessibilityRole="button"
                    >
                      <View style={styles.resultTextWrap}>
                        <Text style={styles.resultName}>{task.tag_nombre_tarea}</Text>

                        {task.tag_descripcion_tarea ? (
                          <Text style={styles.resultDesc} numberOfLines={2}>
                            {task.tag_descripcion_tarea}
                          </Text>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.chooseBtnText,
                          isSelected && styles.chooseBtnTextSelected,
                        ]}
                      >
                        {isSelected ? "✓ Elegida" : "+ Elegir"}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Bottom explanatory note */}
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              Solo tareas ya cargadas. Para crear nuevas, usá la sección Tareas generales.
            </Text>
          </View>

          {/* Footer actions */}
          <View style={styles.footerActions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </Pressable>

            <Pressable
              style={[
                styles.confirmBtn,
                !selectedTask && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!selectedTask}
              accessibilityRole="button"
              aria-disabled={!selectedTask}
            >
              <Text style={styles.confirmBtnText}>Confirmar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    sheet: {
      backgroundColor: c.bgModal,
      borderRadius: 16,
      padding: 24,
      width: "100%",
      maxWidth: 440,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: c.textMuted,
    },
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    searchInput: {
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
      paddingHorizontal: 14,
      fontSize: 14,
      color: c.text,
    },
    resultsContainer: {
      marginTop: 12,
      minHeight: 80,
    },
    messageBox: {
      paddingVertical: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    messageText: {
      fontSize: 13.5,
      color: c.textMuted,
      textAlign: "center",
    },
    resultsScroll: {
      maxHeight: 220,
    },
    resultRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    resultRowSelected: {
      backgroundColor: c.accent + "18",
      borderColor: c.accent,
      borderWidth: 1,
    },
    resultRowDisabled: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      opacity: 0.55,
      borderBottomWidth: 1,
      borderBottomColor: c.borderRow,
    },
    resultTextWrap: {
      flex: 1,
      marginRight: 12,
    },
    resultName: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.text,
    },
    resultNameDisabled: {
      fontSize: 13.5,
      fontWeight: "700",
      color: c.textMuted,
    },
    resultDesc: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    resultDescDisabled: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
    chooseBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: c.accent,
    },
    chooseBtnTextSelected: {
      color: c.accent,
      fontWeight: "700",
    },
    alreadyBadge: {
      fontSize: 12.5,
      color: c.textMuted,
      fontWeight: "500",
    },
    noteBox: {
      backgroundColor: c.bgNested,
      borderRadius: 8,
      padding: 12,
      marginTop: 16,
    },
    noteText: {
      fontSize: 12,
      color: c.textMuted,
      lineHeight: 16,
    },
    footerActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 10,
      marginTop: 20,
    },
    cancelBtn: {
      height: 42,
      paddingHorizontal: 20,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtnText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 13.5,
    },
    confirmBtn: {
      height: 42,
      paddingHorizontal: 22,
      borderRadius: 10,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmBtnDisabled: {
      opacity: 0.45,
      ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : {}),
    },
    confirmBtnText: {
      color: "#FFFFFF",
      fontWeight: "600",
      fontSize: 13.5,
    },
  });
}
