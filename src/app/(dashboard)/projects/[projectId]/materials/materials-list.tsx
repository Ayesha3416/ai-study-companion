"use client";

import { useEffect, useState } from "react";
import { MaterialStatusBadge } from "./status-badge";

type Material = {
  id: string;
  file_name: string;
  status: string;
  error_message: string | null;
  page_count: number | null;
  file_size_bytes: number | null;
  created_at: string;
};

const IN_PROGRESS_STATUSES = new Set([
  "queued",
  "processing",
  "reading_content",
  "understanding_structure",
  "extracting_knowledge",
  "creating_searchable_representation",
]);

const POLL_INTERVAL_MS = 3000;

export function MaterialsList({
  projectId,
  initialMaterials,
}: {
  projectId: string;
  initialMaterials: Material[];
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  // Mirrors `initialMaterials` into state during render (React's documented
  // "adjusting state when a prop changes" pattern) instead of in an effect.
  // Doing this in an effect would let the polling effect below fire once
  // with the *stale* `materials` from the previous project's render before
  // the sync effect catches up — a one-tick window where a just-navigated
  // page could show the previous project's materials list.
  const [prevInitialMaterials, setPrevInitialMaterials] =
    useState(initialMaterials);
  if (initialMaterials !== prevInitialMaterials) {
    setPrevInitialMaterials(initialMaterials);
    setMaterials(initialMaterials);
  }

  useEffect(() => {
    const hasInProgress = materials.some((m) =>
      IN_PROGRESS_STATUSES.has(m.status)
    );
    if (!hasInProgress) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/materials`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        setMaterials(data.materials);
      } catch {
        // Silently skip a failed poll — it'll retry on the next tick.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [materials, projectId]);

  if (materials.length === 0) {
    return (
      <p className="mt-3 text-sm text-neutral-500">
        No materials yet — upload a PDF to get started.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {materials.map((m) => (
        <li
          key={m.id}
          className="flex items-center justify-between rounded-lg border p-3"
        >
          <div>
            <p className="text-sm font-medium">{m.file_name}</p>
            {m.error_message && (
              <p className="text-xs text-red-600">{m.error_message}</p>
            )}
          </div>
          <MaterialStatusBadge status={m.status} />
        </li>
      ))}
    </ul>
  );
}
