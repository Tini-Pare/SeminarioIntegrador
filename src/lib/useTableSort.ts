import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

// One accessor per sortable column, keyed by the same field name the header
// cell passes to `toggle`. The value it returns drives the comparison:
// numbers sort numerically, everything else sorts as a locale-aware string.
export type SortAccessors<T> = Record<
  string,
  (row: T) => string | number | boolean | null | undefined
>;

export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initialField: string,
  initialDir: SortDir = "asc",
) {
  const [field, setField] = useState(initialField);
  const [dir, setDir] = useState<SortDir>(initialDir);

  // Same column -> flip direction; new column -> start ascending.
  function toggle(next: string) {
    if (next === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setField(next);
      setDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const get = accessors[field];
    if (!get) return rows;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      // Null/undefined always sink to the bottom regardless of direction.
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return (
        String(va).localeCompare(String(vb), "es", { sensitivity: "base", numeric: true }) * factor
      );
    });
    // accessors is rebuilt every render; keying on field/dir/rows is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, field, dir]);

  return { sorted, field, dir, toggle };
}
