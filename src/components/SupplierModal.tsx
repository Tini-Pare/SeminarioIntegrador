import { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, View } from "react-native";
import {
  createSupplier,
  updateSupplier,
  type SupplierInput,
  type SupplierWithRubro,
} from "../lib/queries/suppliers";
import { formatCuit, isValidCuit } from "../lib/cuit";
import type { ThemeColors } from "../lib/theme";
import { useTheme } from "../lib/ThemeContext";
import type { TipoProveedor } from "../types/database";
import { FormFooter } from "./FormFooter";
import { Select } from "./Select";

// Digits plus the usual separators (spaces, +, -, parentheses): area codes and
// formats vary, so length isn't checked — only that there are no letters and at
// least one digit.
function isValidPhone(raw: string): boolean {
  return /^[0-9+\-()\s]+$/.test(raw) && /[0-9]/.test(raw);
}

// Structure only (something@something.tld). Checking that the mailbox actually
// exists needs a confirmation email, which is out of scope here.
function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);
}

export function SupplierModal({
  visible,
  onClose,
  onSaved,
  supplier,
  tipos = [],
  existingSuppliers = [],
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplier?: SupplierWithRubro | null;
  tipos?: TipoProveedor[];
  existingSuppliers?: SupplierWithRubro[];
}) {
  const isEditing = !!supplier;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cuit, setCuit] = useState("");
  const [tpId, setTpId] = useState<number | null>(null);
  const [rubroOpen, setRubroOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const rubroOptions = useMemo(
    () => tipos.map((t) => ({ value: t.tp_id, label: t.tp_nombre_rubro })),
    [tipos],
  );

  useEffect(() => {
    if (!visible) return;
    setName(supplier?.prov_nombre ?? "");
    setPhone(supplier?.prov_telefono ?? "");
    setEmail(supplier?.prov_correo ?? "");
    setCuit(supplier?.prov_cuit ?? "");
    setTpId(supplier?.tp_id ?? null);
    setRubroOpen(false);
    setError(null);
  }, [visible, supplier]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre del proveedor no puede estar vacío.");
      return;
    }

    if (tpId == null) {
      setError("Elegí un rubro de la lista.");
      return;
    }

    const normalized = trimmedName.toLocaleLowerCase();
    const isDuplicate = existingSuppliers.some(
      (s) =>
        s.prov_id_proveedor !== supplier?.prov_id_proveedor &&
        s.prov_nombre.trim().toLocaleLowerCase() === normalized,
    );
    if (isDuplicate) {
      setError("Ya existe un proveedor con ese nombre");
      return;
    }

    // Required: every comprobante a supplier issues carries its CUIT, and
    // Registrar compra shows it (and won't save a compra without it).
    if (!cuit.trim()) {
      setError("El CUIT del proveedor es obligatorio.");
      return;
    }
    if (!isValidCuit(cuit)) {
      setError("El CUIT no es válido. Tiene que tener 11 números, por ejemplo 20-22725470-0.");
      return;
    }

    // Both are required: a supplier with no contact data can't be reached when
    // a purchase needs following up.
    if (!phone.trim()) {
      setError("El teléfono del proveedor es obligatorio.");
      return;
    }
    if (!isValidPhone(phone.trim())) {
      setError("El teléfono solo puede tener números.");
      return;
    }
    if (!email.trim()) {
      setError("El correo del proveedor es obligatorio.");
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError("El correo no es válido. Tiene que ser del tipo nombre@dominio.com.");
      return;
    }

    const payload: SupplierInput = {
      name: trimmedName,
      phone: phone.trim(),
      email: email.trim(),
      // Always stored as XX-XXXXXXXX-X, however it was typed.
      cuit: formatCuit(cuit),
      tpId,
    };

    setSaving(true);
    setError(null);
    try {
      if (supplier) {
        await updateSupplier(supplier.prov_id_proveedor, payload);
      } else {
        await createSupplier(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{isEditing ? "Editar proveedor" : "Crear proveedor"}</Text>

          <Text style={styles.subtitle}>
            {isEditing
              ? supplier!.prov_nombre
              : "Registrá un proveedor para asociarlo a las compras."}
          </Text>

          <Text style={styles.label}>Nombre</Text>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Ej: Refrigeración del Sur S.A."
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.label}>Rubro</Text>
          {rubroOptions.length === 0 ? (
            <Text style={styles.hint}>
              No hay rubros cargados. Un administrador tiene que darlos de alta en la base de datos
              antes de crear proveedores.
            </Text>
          ) : (
            <Select
              value={tpId}
              onChange={setTpId}
              options={rubroOptions}
              placeholder="Elegí un rubro"
              open={rubroOpen}
              onOpenChange={setRubroOpen}
            />
          )}

          <Text style={styles.label}>CUIT</Text>
          <TextInput
            style={styles.input}
            value={cuit}
            onChangeText={setCuit}
            placeholder="Ej: 20-22725470-0"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={13}
          />

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Ej: 351 555 1234"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                maxLength={30}
              />
            </View>

            <View style={styles.rowItem}>
              <Text style={styles.label}>Correo</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Ej: ventas@proveedor.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                maxLength={100}
              />
            </View>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <FormFooter
            onCancel={onClose}
            onConfirm={handleSave}
            busy={saving}
            disabled={rubroOptions.length === 0}
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
    label: {
      fontSize: 12.5,
      fontWeight: "600",
      color: c.textLabel,
      marginTop: 18,
      marginBottom: 8,
    },
    hint: { fontSize: 12.5, color: c.textMuted, lineHeight: 17 },
    input: {
      minHeight: 42,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: c.borderInput,
      borderRadius: 10,
      backgroundColor: c.bgInput,
      fontSize: 14,
      color: c.text,
    },
    row: { flexDirection: "row", gap: 12 },
    rowItem: { flex: 1 },
    error: { color: c.destructive, marginTop: 12, fontSize: 13 },
  });
}
