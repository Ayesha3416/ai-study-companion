export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpace } from "../actions";
import { listProjectsForSpace } from "./projects/actions";
import { NewProjectForm } from "./projects/new-project-form";

export default async function SpaceDashboardPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;

  let space;
  try {
    space = await getSpace(spaceId);
  } catch {
    notFound();
  }

  const projects = await listProjectsForSpace(spaceId);

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
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
