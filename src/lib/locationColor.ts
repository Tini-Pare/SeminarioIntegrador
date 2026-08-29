const PALETTE = [
  "#4a9b74",
  "#7ba33f",
  "#2f7d5b",
  "#8a9a52",
  "#3f8f7a",
  "#c99433",
  "#a0522d",
  "#6a7b62",
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
