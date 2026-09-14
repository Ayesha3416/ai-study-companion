export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
