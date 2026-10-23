// Shared matching for every search box. Two rules, picked per field:
// - startsWithSearch for short names that begin with what the thing is
//   (repuestos, tareas, fallas, tipos de equipo, sectores): "ace" finds
//   "Aceite" but not "Cable de acero".
// - includesSearch for everything else (descriptions, codes, N° de OT,
//   people, emails), where the part someone remembers is often mid-text:
//   "105" finds "AC-105", "junta" finds "...pierde agua por la junta".
// Both are case- and accent-insensitive, so "camara" finds "Cámara".

export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// `query` must already be normalized (normalizeSearch(search.trim())), so
// it's done once per keystroke instead of once per row.
export function startsWithSearch(text: string | null | undefined, query: string): boolean {
  return !!text && normalizeSearch(text).startsWith(query);
}

export function includesSearch(text: string | null | undefined, query: string): boolean {
  return !!text && normalizeSearch(text).includes(query);
}
