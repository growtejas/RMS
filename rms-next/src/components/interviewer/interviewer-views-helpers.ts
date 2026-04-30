import type { Interview } from "@/lib/api/candidateApi";

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function roundTitle(iv: Interview): string {
  if (iv.round_name?.trim()) return iv.round_name.trim();
  return `Round ${iv.round_number}`;
}

export function formatDateTime(iv: Interview): { date: string; time: string } {
  const start = new Date(iv.scheduled_at);
  const end = iv.end_time ? new Date(iv.end_time) : null;
  return {
    date: start.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: `${start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${
      end
        ? ` – ${end.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : ""
    }`,
  };
}

export function formatDuration(iv: Interview): string {
  if (!iv.end_time) return "—";
  const a = new Date(iv.scheduled_at).getTime();
  const b = new Date(iv.end_time).getTime();
  const minutes = Math.round((b - a) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function resumeBasename(resumePath: string | null): string | null {
  if (!resumePath?.trim()) return null;
  const s = resumePath.replace(/\\/g, "/").trim();
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}
