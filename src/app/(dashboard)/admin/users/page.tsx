export const dynamic = "force-dynamic";

import Link from "next/link";
import { listUsersForAdmin } from "@/lib/admin/users";
import { LocalTimestamp } from "@/components/local-timestamp";

export default async function AdminUsersPage() {
  const users = await listUsersForAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-neutral-500">{users.length} total</p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2">User</th>
              <th className="px-4 py-2">Registered</th>
              <th className="px-4 py-2">Last Active</th>
              <th className="px-4 py-2 text-right">Spaces</th>
              <th className="px-4 py-2 text-right">Projects</th>
              <th className="px-4 py-2 text-right">Activity</th>
              <th className="px-4 py-2 text-right">Progress</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-neutral-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${u.id}`} className="font-medium hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  <LocalTimestamp value={u.registeredAt} />
                </td>
                <td className="px-4 py-2 text-neutral-500">
                  {u.lastActiveAt ? <LocalTimestamp value={u.lastActiveAt} /> : "—"}
                </td>
                <td className="px-4 py-2 text-right">{u.spaceCount}</td>
                <td className="px-4 py-2 text-right">{u.projectCount}</td>
                <td className="px-4 py-2 text-right">{u.activityCount}</td>
                <td className="px-4 py-2 text-right">
                  {u.overallProgress === null ? "—" : `${u.overallProgress}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
