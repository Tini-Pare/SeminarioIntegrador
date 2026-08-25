import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { CalendarIcon } from "./icons";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../lib/theme";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function isValidDateString(str: string): boolean {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return false;

  const parts = str.split("/");
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parseInt(parts[2], 10);
  const date = new Date(y, m, d);

  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
}

export function toDbDate(str: string): string {
  const parts = str.split("/");
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function fromDbDate(dbDate: string | null | undefined): string {
  if (!dbDate) return "";

  const parts = dbDate.split("-");
  if (parts.length !== 3) return "";

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function CustomDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [flipVertical, setFlipVertical] = useState(false);
  const inputRef = useRef<View>(null);
  const { colors } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const showOnRight = windowWidth >= 1050;
  const styles = makeStyles(colors, showOnRight, flipVertical);

  const parseDateString = (str: string): Date | null => {
    const parts = str.split("/");
    if (parts.length !== 3) return null;

    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;

    const date = new Date(y, m, d);
    if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
      return date;
    }

    return null;
  };

  useEffect(() => {
    if (isOpen) {
      const parsed = parseDateString(value);
      if (parsed) {
        setCurrentMonth(parsed.getMonth());
        setCurrentYear(parsed.getFullYear());
      } else {
        const today = new Date();
        setCurrentMonth(today.getMonth());
        setCurrentYear(today.getFullYear());
      }
    }
  }, [isOpen, value]);

  const handleTextChange = (text: string) => {
    let cleaned = text.replace(/[^0-9/]/g, "");

    if (cleaned.length < value.length) {
      onChange(cleaned);
      return;
    }

    if (cleaned.length === 2 && !cleaned.includes("/")) {
      cleaned = cleaned + "/";
    } else if (cleaned.length === 5 && cleaned.split("/").length === 2) {
      cleaned = cleaned + "/";
    }

    if (cleaned.length <= 10) {
      onChange(cleaned);
    }
  };

  const getDaysInMonth = (month: number, year: number) => {
    const date = new Date(year, month, 1);
    const days = [];

    let firstDayIndex = date.getDay() - 1;
    if (firstDayIndex < 0) firstDayIndex = 6;

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    const totalDays = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const changeMonth = (direction: number) => {
    let newMonth = currentMonth + direction;
    let newYear = currentYear;

    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

  const handleSelectDay = (dayDate: Date) => {
    const yyyy = dayDate.getFullYear();
    const mm = String(dayDate.getMonth() + 1).padStart(2, "0");
    const dd = String(dayDate.getDate()).padStart(2, "0");
    onChange(`${dd}/${mm}/${yyyy}`);
    setIsOpen(false);
  };

  const handleToggle = () => {
    if (!isOpen) {
      inputRef.current?.measure((x, y, width, height, pageX, pageY) => {
        const dropdownHeight = 180;
        const spaceBelow = windowHeight - pageY - height;
        if (spaceBelow < dropdownHeight && pageY > dropdownHeight) {
          setFlipVertical(true);
        } else {
          setFlipVertical(false);
        }
      });
    }
    setIsOpen(!isOpen);
  };

  const calendarDays = getDaysInMonth(currentMonth, currentYear);
  const selectedDateObj = parseDateString(value);
  const todayDate = new Date();

  return (
    <View style={styles.container}>
      <View ref={inputRef} style={styles.inputWrapper}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={handleTextChange}
          keyboardType="numeric"
        />

        <Pressable style={styles.iconButton} onPress={handleToggle}>
          <CalendarIcon size={18} color={colors.textLabel} />
        </Pressable>
      </View>

      {isOpen && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setIsOpen(false)} />

          <View style={styles.dropdown}>
            <View style={styles.header}>
              <Pressable style={styles.navButton} onPress={() => changeMonth(-1)}>
                <Text style={styles.navButtonText}>{"<"}</Text>
              </Pressable>

              <Text style={styles.headerTitle}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </Text>

              <Pressable style={styles.navButton} onPress={() => changeMonth(1)}>
                <Text style={styles.navButtonText}>{">"}</Text>
              </Pressable>
            </View>

            <View style={styles.weekdaysRow}>
              {WEEK_DAYS.map((day, idx) => (
                <Text key={idx} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCellEmpty} />;
                }

                const isSelected =
                  selectedDateObj &&
                  selectedDateObj.getDate() === day.getDate() &&
                  selectedDateObj.getMonth() === day.getMonth() &&
                  selectedDateObj.getFullYear() === day.getFullYear();

                const isToday =
                  todayDate.getDate() === day.getDate() &&
                  todayDate.getMonth() === day.getMonth() &&
                  todayDate.getFullYear() === day.getFullYear();

                return (
                  <Pressable
                    key={`day-${idx}`}
                    style={[
                      styles.dayCell,
                      isToday && styles.dayCellToday,
                      isSelected && styles.dayCellSelected,
                    ]}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && styles.dayTextToday,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function makeStyles(c: ThemeColors, showOnRight: boolean, flipVertical: boolean) {
  return StyleSheet.create({
    container: {
      position: "relative",
      width: "100%",
      zIndex: 50,
    },
    inputWrapper: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      height: 44,
      overflow: "hidden",
    },
    input: {
      flex: 1,
      height: "100%",
      paddingHorizontal: 14,
      fontSize: 14,
      color: c.text,
    },
    iconButton: {
      paddingHorizontal: 14,
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    backdrop: {
      position: Platform.OS === "web" ? "fixed" : "absolute",
      top: Platform.OS === "web" ? 0 : -1000,
      left: Platform.OS === "web" ? 0 : -1000,
      right: Platform.OS === "web" ? 0 : -1000,
      bottom: Platform.OS === "web" ? 0 : -1000,
      zIndex: 999,
      backgroundColor: "transparent",
    },
    dropdown: {
      position: "absolute",
      top: showOnRight ? (flipVertical ? undefined : 0) : (flipVertical ? undefined : 48),
      bottom: showOnRight ? (flipVertical ? 0 : undefined) : (flipVertical ? 48 : undefined),
      left: showOnRight ? "100%" : 0,
      marginLeft: showOnRight ? 8 : 0,
      width: 250,
      maxHeight: 180,
      backgroundColor: c.bgModal,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 12,
      padding: 8,
      zIndex: 1000,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 5,
      elevation: 5,
      ...(Platform.OS === "web"
        ? {
            boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
            overflowY: "auto",
          }
        : {}),
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    headerTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: c.text,
    },
    navButton: {
      width: 22,
      height: 22,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.borderInput,
      backgroundColor: c.bgInput,
    },
    navButtonText: {
      fontSize: 11,
      fontWeight: "600",
      color: c.textLabel,
    },
    weekdaysRow: {
      flexDirection: "row",
      marginBottom: 3,
    },
    weekdayText: {
      width: "14.28%",
      textAlign: "center",
      fontSize: 9,
      fontWeight: "600",
      color: c.textMuted,
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: "14.28%",
      height: 24,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      marginVertical: 0.5,
    },
    dayCellEmpty: {
      width: "14.28%",
      height: 24,
    },
    dayCellToday: {
      borderWidth: 1,
      borderColor: c.borderInput,
    },
    dayCellSelected: {
      backgroundColor: c.accent,
    },
    dayText: {
      fontSize: 10.5,
      color: c.text,
    },
    dayTextToday: {
      fontWeight: "700",
      color: c.accent,
    },
    dayTextSelected: {
      fontWeight: "700",
      color: "#fff",
    },
  });
}
