import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";

// Every route under /admin (this page, and every future one from Steps
// 27-30) is gated here once — individual admin pages don't each need their
// own requireAdmin() call. Layouts run on every navigation into the
// segment, same as a page would, so this can't be bypassed by linking
// directly to a nested admin route.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div>
      <nav className="border-b bg-neutral-50 px-8 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-4 text-sm">
          <span className="font-medium text-neutral-400">Admin</span>
          <Link href="/admin" className="hover:underline">
            Overview
          </Link>
          <Link href="/admin/users" className="hover:underline">
            Users
          </Link>
          <Link href="/admin/spaces" className="hover:underline">
            Spaces
          </Link>
          <Link href="/admin/projects" className="hover:underline">
            Projects
          </Link>
          <Link href="/admin/activity" className="hover:underline">
            Activity
          </Link>
          <Link href="/admin/ai-usage" className="hover:underline">
            AI Usage
          </Link>
          <Link href="/admin/system-health" className="hover:underline">
            System Health
          </Link>
          <Link href="/admin/evaluation" className="hover:underline">
            Evaluation
          </Link>
          <Link href="/home" className="ml-auto text-neutral-400 hover:underline">
            ← Back to App
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
