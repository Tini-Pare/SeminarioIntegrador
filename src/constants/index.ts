export const BREAKPOINT = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  bigDesktop: 1440,
} as const;

// Right padding of a right-aligned figures column in the list tables, so
// its digits don't sit flush against the left-aligned column after it.
// Header cell and row cell use the same value, or the figures drift off
// their header.
export const NUMERIC_COL_GAP = 40;
