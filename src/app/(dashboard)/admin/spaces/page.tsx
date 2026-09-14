export const dynamic = "force-dynamic";

import { listSpacesForAdmin } from "@/lib/admin/spaces-projects";
import { LocalTimestamp } from "@/components/local-timestamp";

export default async function AdminSpacesPage() {
  const spaces = await listSpacesForAdmin();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Spaces</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every Space across the platform, with its owner and activity.
        </p>
      </div>

      {spaces.length === 0 ? (
        <p className="text-sm text-neutral-400">No spaces yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b bg-neutral-50 text-neutral-500">
              <tr>
                <th className="py-2 pr-4 pl-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Owner</th>
                <th className="py-2 pr-4 font-medium">Projects</th>
                <th className="py-2 pr-4 font-medium">Activity</th>
                <th className="py-2 pr-4 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 pl-4 font-medium">{s.name}</td>
                  <td className="py-2 pr-4 text-neutral-500">{s.ownerEmail}</td>
                  <td className="py-2 pr-4">{s.projectCount}</td>
                  <td className="py-2 pr-4">{s.activityCount}</td>
                  <td className="py-2 pr-4 text-neutral-400">
                    {s.lastActivityAt ? <LocalTimestamp value={s.lastActivityAt} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
