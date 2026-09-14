export const dynamic = "force-dynamic";

import { listProjectsForAdmin } from "@/lib/admin/spaces-projects";
import { LocalTimestamp } from "@/components/local-timestamp";

export default async function AdminProjectsPage() {
  const projects = await listProjectsForAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Every Project across the platform, with owner, Space, and activity.
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-neutral-400">No projects yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-neutral-500">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Owner</th>
              <th className="py-2 pr-4 font-medium">Space</th>
              <th className="py-2 pr-4 font-medium">Materials</th>
              <th className="py-2 pr-4 font-medium">Tutor</th>
              <th className="py-2 pr-4 font-medium">Quiz</th>
              <th className="py-2 pr-4 font-medium">Progress</th>
              <th className="py-2 pr-4 font-medium">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{p.name}</td>
                <td className="py-2 pr-4 text-neutral-500">{p.ownerEmail}</td>
                <td className="py-2 pr-4 text-neutral-500">{p.spaceName}</td>
                <td className="py-2 pr-4">{p.materialsCount}</td>
                <td className="py-2 pr-4">{p.tutorActivityCount}</td>
                <td className="py-2 pr-4">{p.quizActivityCount}</td>
                <td className="py-2 pr-4">{p.progress === null ? "—" : `${p.progress}%`}</td>
                <td className="py-2 pr-4 text-neutral-400">
                  {p.lastActivityAt ? <LocalTimestamp value={p.lastActivityAt} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
