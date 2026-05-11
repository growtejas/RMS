export default function Loading() {
  return (
    <div className="w-full min-w-0 px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-200/70" />
        <div className="h-7 w-72 rounded bg-slate-200/70" />
      </div>

      <div className="mt-6 h-10 w-full rounded-xl border border-slate-200 bg-white" />

      <div className="mt-6 grid gap-4">
        <div className="h-40 rounded-xl border border-slate-200 bg-white" />
        <div className="h-64 rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

