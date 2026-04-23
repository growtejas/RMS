"use client";

import React, { useMemo } from "react";

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "U";
  const a = parts[0]?.[0] ?? "U";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase();
}

function hashToHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function Avatar({
  name,
  size = 32,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const label = useMemo(() => initials(name), [name]);
  const hue = useMemo(() => hashToHue(name || label), [name, label]);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    backgroundColor: `hsl(${hue} 70% 92%)`,
    color: `hsl(${hue} 55% 28%)`,
  };
  return (
    <div
      className={`inline-flex select-none items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset ring-slate-200 ${className}`}
      style={style}
      aria-label={name}
      title={name}
    >
      {label}
    </div>
  );
}

