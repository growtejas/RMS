"use client";

import React from "react";

export function Checkbox({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      type="checkbox"
      className={`h-4 w-4 rounded border-border accent-black ${className}`}
    />
  );
}
