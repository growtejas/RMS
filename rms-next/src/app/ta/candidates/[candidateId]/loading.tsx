export default function Loading() {
  return (
    <div className="w-full min-w-0 bg-slate-50">
      <div className="sticky top-0 z-10 w-full border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="h-7 w-64 rounded bg-slate-200/70" />
        <div className="mt-2 h-4 w-80 rounded bg-slate-200/60" />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 pb-16 sm:px-6">
        <div className="h-28 rounded-xl border border-slate-200 bg-white" />
        <div className="mt-4 h-72 rounded-xl border border-slate-200 bg-white" />
        <div className="mt-4 h-72 rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

