// Human-facing identifier of an orden de trabajo, like an invoice number
// ("se generó la OT-0027"). It's just ot_id_orden zero-padded: that column
// is already a sequential identity, so no extra column/sequence is needed.
export function formatOrderNumber(orderId: number): string {
  return `OT-${String(orderId).padStart(4, "0")}`;
}
