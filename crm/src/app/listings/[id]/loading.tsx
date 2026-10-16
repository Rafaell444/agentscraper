export default function Loading() {
  return (
    <div className="animate-pulse grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="იტვირთება">
      <div className="space-y-4 lg:col-span-2">
        <div className="h-72 rounded-2xl bg-gray-200/70" />
        <div className="h-40 rounded-2xl bg-gray-200/50" />
      </div>
      <div className="space-y-4">
        <div className="h-40 rounded-2xl bg-gray-200/60" />
        <div className="h-32 rounded-2xl bg-gray-200/50" />
        <div className="h-32 rounded-2xl bg-gray-200/40" />
      </div>
    </div>
  );
}
