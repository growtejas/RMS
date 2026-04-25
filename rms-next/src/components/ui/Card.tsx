"use client";

import React from "react";

export function Card({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={`rounded-2xl border border-border bg-surface shadow-sm ${className}`}
    />
  );
}

export function CardHeader({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`px-5 py-4 ${className}`} />;
}

export function CardTitle({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      {...props}
      className={`text-base font-bold tracking-tight text-text ${className}`}
    />
  );
}

export function CardBody({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`px-5 pb-5 ${className}`} />;
}

