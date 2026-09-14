const STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  reading_content: "Reading content",
  understanding_structure: "Understanding structure",
  extracting_knowledge: "Extracting knowledge",
  creating_searchable_representation: "Creating searchable representation",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const DEFAULT_STYLE = "bg-amber-100 text-amber-800"; // in-progress states

export function MaterialStatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? DEFAULT_STYLE;
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
