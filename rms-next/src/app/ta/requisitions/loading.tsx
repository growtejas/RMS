export default function Loading() {
  return (
    <div className="w-full min-w-0 px-4 py-8 sm:px-6">
      <div className="h-7 w-64 rounded bg-slate-200/70" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-slate-200/60" />

      <div className="mt-6 grid gap-3">
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
        <div className="h-24 rounded-xl border border-slate-200 bg-white" />
      </div>

      <div className="mt-6 h-72 rounded-xl border border-slate-200 bg-white" />
    </div>
  );
}

