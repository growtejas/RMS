"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Gmail-style bulk selection: either explicit id set or "all matching" with exclusions.
 */
export function useSelectionModel(opts: {
  visibleIds: number[];
  totalMatching: number;
}) {
  const { visibleIds, totalMatching } = opts;

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [excludedIds, setExcludedIds] = useState<Set<number>>(() => new Set());
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);

  const isSelected = useCallback(
    (id: number) => {
      if (isAllMatchingSelected) return !excludedIds.has(id);
      return selectedIds.has(id);
    },
    [isAllMatchingSelected, excludedIds, selectedIds],
  );

  const selectedCount = useCallback(() => {
    if (isAllMatchingSelected) return Math.max(0, totalMatching - excludedIds.size);
    return selectedIds.size;
  }, [isAllMatchingSelected, totalMatching, excludedIds.size, selectedIds.size]);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setExcludedIds(new Set());
    setIsAllMatchingSelected(false);
  }, []);

  const selectAllMatching = useCallback(() => {
    setIsAllMatchingSelected(true);
    setSelectedIds(new Set());
    setExcludedIds(new Set());
  }, []);

  const toggleRow = useCallback(
    (id: number) => {
      if (isAllMatchingSelected) {
        setExcludedIds((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        });
      } else {
        setSelectedIds((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        });
      }
    },
    [isAllMatchingSelected],
  );

  /** Header checkbox: select exactly this page, or clear if this page is already fully selected. */
  const toggleSelectVisiblePage = useCallback(() => {
    if (isAllMatchingSelected) {
      const allVisibleIncluded = visibleIds.every((id) => !excludedIds.has(id));
      setExcludedIds((prev) => {
        const n = new Set(prev);
        if (allVisibleIncluded) {
          for (const id of visibleIds) n.add(id);
        } else {
          for (const id of visibleIds) n.delete(id);
        }
        return n;
      });
      return;
    }
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleIds));
  }, [isAllMatchingSelected, excludedIds, selectedIds, visibleIds]);

  const headerCheckboxState: "checked" | "unchecked" | "indeterminate" = useMemo(() => {
    if (visibleIds.length === 0) return "unchecked";
    if (isAllMatchingSelected) {
      const anyExcluded = visibleIds.some((id) => excludedIds.has(id));
      const allExcluded = visibleIds.every((id) => excludedIds.has(id));
      if (allExcluded) return "unchecked";
      if (anyExcluded) return "indeterminate";
      return "checked";
    }
    const nSel = visibleIds.filter((id) => selectedIds.has(id)).length;
    if (nSel === 0) return "unchecked";
    if (nSel === visibleIds.length) return "checked";
    return "indeterminate";
  }, [visibleIds, isAllMatchingSelected, excludedIds, selectedIds]);

  return {
    isSelected,
    selectedCount,
    clear,
    selectAllMatching,
    toggleRow,
    toggleSelectVisiblePage,
    headerCheckboxState,
    selectedIds,
    excludedIds,
    isAllMatchingSelected,
  };
}
