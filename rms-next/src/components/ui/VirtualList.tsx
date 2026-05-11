"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

/**
 * Phase 6 - generic virtualized list, mounted by the heaviest list views
 * (audit log timeline and candidate workspace).
 *
 * Why a wrapper instead of using `useVirtualizer` directly at call sites:
 * - the row container needs `position: relative` and an explicit height
 *   to scroll, and missing those is the failure mode that gets shipped.
 * - we centralize the overscan / estimated row height defaults so list
 *   panels stay in the 50ms commit budget even with 1k+ rows.
 *
 * Threshold: callers should keep their existing flat `.map()` rendering
 * for small lists (< ~50 rows). Phase 6 wraps the tabs that exceed that
 * (`pageSize > 50`).
 */
export function VirtualList<T>({
  items,
  renderItem,
  estimateSize = 56,
  overscan = 8,
  height = 600,
  className,
  emptyState,
  getItemKey,
}: {
  items: readonly T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Average row height in px. Refined automatically as rows mount. */
  estimateSize?: number;
  overscan?: number;
  /** Container height (px). Inline so it works without a parent layout. */
  height?: number | string;
  className?: string;
  emptyState?: React.ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
}) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: getItemKey
      ? (index) => getItemKey(items[index]!, index)
      : undefined,
  });

  if (items.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>;
  }

  const totalSize = rowVirtualizer.getTotalSize();
  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={className}
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        overflowY: "auto",
        contain: "strict",
      }}
    >
      <div
        style={{
          height: `${totalSize}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            {renderItem(items[vi.index]!, vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
