"use client";

import { useEffect, useState } from "react";

/**
 * Tiny debounce hook used by paginated lists to delay URL writes / queries
 * until the user pauses typing. 250 ms by default, matching the canonical
 * search debounce documented in the pagination contract.
 */
export function useDebouncedValue<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
