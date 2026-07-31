const PALETTE = [
  "#2f53e0",
  "#1e7f47",
  "#c9821e",
  "#8a3ffc",
  "#c0392b",
  "#0e7490",
  "#a0522d",
  "#6b7280",
];

export function buildLocationColorMap(locations: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const location of locations) {
    if (!map.has(location)) {
      map.set(location, PALETTE[map.size % PALETTE.length]);
    }
  }
  return map;
}
