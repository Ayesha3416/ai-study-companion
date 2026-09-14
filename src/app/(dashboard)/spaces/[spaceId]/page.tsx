export const dynamic = "force-dynamic";
// **Bug fix**: this page was missing force-dynamic while projects/[projectId]
// and home/page.tsx already had it. Without it, Next.js can statically
// generate this dynamic-ID page on its first-ever visit and cache that
// response — including a 404 if that first render loses a race right after
// the Space was just created (e.g. an auth/RLS check timing issue on a
// brand-new row). Once cached, that 404 gets served to EVERY subsequent
// visitor of that exact URL, not just the user who hit it — this is what
// was causing "works for me sometimes, completely 404 for other users."
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpace } from "../actions";
import { listProjectsForSpace } from "./projects/actions";
import { NewProjectForm } from "./projects/new-project-form";
import { isNotFoundError } from "@/lib/supabase/errors";

export default async function SpaceDashboardPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  let space;
  try {
    space = await getSpace(spaceId);
  } catch (error) {
    // See src/lib/supabase/errors.ts — only a genuine not-found is a 404.
    if (isNotFoundError(error)) notFound();
    throw error;
  }

  // Same principle as projects/[projectId]/page.tsx: a transient failure
  // reading the project list shouldn't crash the whole Space dashboard
  // when the Space itself (already fetched above) is fine.
  let projects: Awaited<ReturnType<typeof listProjectsForSpace>> = [];
  try {
    projects = await listProjectsForSpace(spaceId);
  } catch (error) {
    console.error("Failed to list projects for space:", error);
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">
          {space.icon} {space.name}
        </h1>
        {space.description && (
          <p className="mt-1 text-sm text-neutral-500">{space.description}</p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-2">
          New Project
        </h2>
        <NewProjectForm spaceId={spaceId} />
      </div>

      <div>
        <h2 className="text-sm font-medium text-neutral-700 mb-2">
          Projects
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No Projects yet — create your first one above.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded-lg border p-4 hover:bg-neutral-50"
                >
                  <span className="font-medium">{project.name}</span>
                  {project.goal && (
                    <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                      Goal: {project.goal}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
