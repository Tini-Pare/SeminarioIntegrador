import { useState } from "react";

// Calls `reset` while rendering whenever `open` turns true, or while open if
// any of `deps` changes (by identity). This is React's "adjust state during
// render" pattern
// (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
// unlike resetting a modal's form in an effect, the first frame after opening
// already shows the reset values instead of the previous ones. `reset` must
// only set state of the calling component — no fetches or other side effects
// (those still go in an effect).
export function useResetOnOpen(
  open: boolean,
  reset: () => void,
  deps: readonly unknown[] = [],
): void {
  const key = [open, ...deps];
  // Starting closed records the key up front; starting open leaves it null so
  // the very first render resets too, like an effect running on mount would.
  const [prevKey, setPrevKey] = useState<readonly unknown[] | null>(() => (open ? null : key));
  const changed =
    prevKey === null ||
    prevKey.length !== key.length ||
    key.some((value, i) => !Object.is(value, prevKey[i]));
  if (changed) {
    setPrevKey(key);
    if (open) reset();
  }
}
