import { useEffect, useState } from "react";

// Runs a screen's `load` on mount (and again if `load`'s identity changes)
// and reports whether that first load is still in flight. Shared so each
// screen doesn't hand-roll the same `load().finally(() => setLoading(false))`
// effect; `load` is expected to catch its own errors and set state only after
// its awaits.
export function useInitialLoad(load: () => Promise<void>): boolean {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  return loading;
}
