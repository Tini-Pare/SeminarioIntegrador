import { useRef, useState } from "react";

export const PAGE_SIZE = 10;

// Client-side pagination for list screens. `resetKey` is a string built
// from the active search/filters — when it changes the list jumps back to
// the first page. Returns the current page's slice plus the controls the
// <Pagination> component needs.
export function usePagination<T>(items: T[], resetKey = "", pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  // Adjust page during render when the filters change (React-supported
  // pattern for derived state) so the slice is always in sync.
  const prevKey = useRef(resetKey);
  if (prevKey.current !== resetKey) {
    prevKey.current = resetKey;
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  return { page: safePage, pageCount, setPage, pageItems };
}
