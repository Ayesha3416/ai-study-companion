export const dynamic = "force-dynamic";

import {
  listActivityForAdmin,
  getAdminActivityFilterOptions,
  type AdminActivityFilters,
} from "@/lib/admin/activity";
import { EVENT_LABELS } from "@/lib/admin/event-labels";
import { LocalTimestamp } from "@/components/local-timestamp";

type SearchParams = {
  userId?: string;
  spaceId?: string;
  projectId?: string;
  eventType?: string;
  period?: string;
};

const PERIODS: { value: NonNullable<AdminActivityFilters["period"]>; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters: AdminActivityFilters = {
    userId: params.userId || undefined,
    spaceId: params.spaceId || undefined,
    projectId: params.projectId || undefined,
    eventType: params.eventType || undefined,
    period: (params.period as AdminActivityFilters["period"]) || "7d",
  };

  const [items, options] = await Promise.all([
    listActivityForAdmin(filters),
    getAdminActivityFilterOptions(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Activity</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Platform-wide event browser. Showing up to 100 most recent matching events.
        </p>
      </div>

      {/* Plain GET form — re-navigating with a new querystring re-runs this
          Server Component with fresh filtered data, same server-first
          pattern used throughout this app rather than client filter state. */}
      <form className="flex flex-wrap gap-2 text-sm" method="get">
        <select name="period" defaultValue={filters.period} className="rounded-md border px-2 py-1.5">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="eventType" defaultValue={filters.eventType ?? ""} className="rounded-md border px-2 py-1.5">
          <option value="">All event types</option>
          {options.eventTypes.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t] ?? t}
            </option>
          ))}
        </select>
        <select name="userId" defaultValue={filters.userId ?? ""} className="rounded-md border px-2 py-1.5">
          <option value="">All users</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
        <select name="spaceId" defaultValue={filters.spaceId ?? ""} className="rounded-md border px-2 py-1.5">
          <option value="">All spaces</option>
          {options.spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select name="projectId" defaultValue={filters.projectId ?? ""} className="rounded-md border px-2 py-1.5">
          <option value="">All projects</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">
          Apply
        </button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400">No activity matches these filters.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span>
                {EVENT_LABELS[e.eventType] ?? e.eventType}
                <span className="text-neutral-400"> · {e.ownerEmail}</span>
                {e.projectName && <span className="text-neutral-400"> · {e.projectName}</span>}
              </span>
              <span className="text-xs text-neutral-400">
                <LocalTimestamp value={e.createdAt} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
