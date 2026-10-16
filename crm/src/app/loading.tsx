export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="იტვირთება">
      <div className="h-7 w-48 rounded-lg bg-gray-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-gray-200/70" />
        ))}
      </div>
      <div className="h-64 rounded-2xl bg-gray-200/60" />
      <div className="h-40 rounded-2xl bg-gray-200/50" />
    </div>
  );
}
