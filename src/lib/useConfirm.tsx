import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";

type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

// Bridges the gap between the old imperative confirmDelete(...) call style and
// a declarative React modal: `confirm({...})` opens the dialog, and the caller
// only has to render `dialog` somewhere in its tree.
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);

  // Keeps the last request around so the text doesn't blank out while the
  // modal fades away after setRequest(null).
  const lastRequest = useRef<ConfirmRequest | null>(null);
  if (request) lastRequest.current = request;
  const shown = request ?? lastRequest.current;

  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);

  const cancel = useCallback(() => setRequest(null), []);

  const accept = useCallback(async () => {
    if (!request) return;
    setBusy(true);
    try {
      // Awaited so the button can show "Procesando…" and stay disabled until
      // the delete actually finishes. Callers handle their own errors; the
      // finally still closes the dialog if one escapes.
      await request.onConfirm();
    } finally {
      setRequest(null);
      setBusy(false);
    }
  }, [request]);

  const dialog = (
    <ConfirmDialog
      visible={!!request}
      title={shown?.title ?? ""}
      message={shown?.message ?? ""}
      confirmLabel={shown?.confirmLabel}
      busy={busy}
      onConfirm={accept}
      onCancel={cancel}
    />
  );

  return { confirm, dialog };
}
