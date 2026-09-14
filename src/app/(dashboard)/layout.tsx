import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

// Previously there was no persistent navigation anywhere outside of
// /admin — every non-admin page only had a single "back to parent" link
// (e.g. Project Dashboard -> its Space), so getting from deep inside a
// Tutor conversation or Quiz attempt back to Home/Spaces/Analytics meant
// editing the URL by hand. This layout wraps every route under
// (dashboard) (admin included, which keeps its own nested nav for its own
// sub-links) with one persistent top bar, mirroring the admin nav's
// responsive pattern (horizontal scroll instead of wrapping/overflowing on
// narrow screens).
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    isAdmin = profile?.role === "admin";
  }

  return (
    <div className="flex min-h-full flex-col">
      {user && (
        <header className="border-b bg-white">
          <nav className="flex items-center gap-4 overflow-x-auto px-4 py-3 text-sm whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] sm:px-8 [&::-webkit-scrollbar]:hidden">
            <Link href="/home" className="font-semibold text-neutral-900">
              AI Study Companion
            </Link>
            <Link href="/home" className="text-neutral-500 hover:underline">
              Home
            </Link>
            <Link href="/spaces" className="text-neutral-500 hover:underline">
              Spaces
            </Link>
            <Link href="/analytics" className="text-neutral-500 hover:underline">
              Analytics
            </Link>
            {isAdmin && (
              <Link href="/admin" className="text-neutral-500 hover:underline">
                Admin
              </Link>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <span className="hidden text-neutral-400 sm:inline">{user.email}</span>
              <form action={signOut}>
                <button
                  type="submit"
                  className="text-neutral-500 hover:underline"
                >
                  Sign out
                </button>
              </form>
            </span>
          </nav>
        </header>
      )}
      <div className="flex-1">{children}</div>
    </div>
  );
}
