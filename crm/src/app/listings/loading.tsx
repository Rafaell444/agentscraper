export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="იტვირთება">
      <div className="h-7 w-56 rounded-lg bg-gray-200" />
      <div className="h-9 w-72 rounded-xl bg-gray-200/70" />
      <div className="h-44 rounded-2xl bg-gray-200/60" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-16 rounded-xl bg-gray-200/50" />
      ))}
    </div>
  );
}
