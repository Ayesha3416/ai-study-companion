import Link from "next/link";
import { listSpaces } from "./actions";
import { NewSpaceForm } from "./new-space-form";

export default async function SpacesPage() {
  const spaces = await listSpaces();

  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Your Spaces</h1>
        <p className="text-sm text-neutral-500">
          A Space is a broad area you&apos;re learning — a skill, subject, or goal.
        </p>
      </div>

      <NewSpaceForm />

      {spaces.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No Spaces yet — create your first one above.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {spaces.map((space) => (
            <li key={space.id}>
              <Link
                href={`/spaces/${space.id}`}
                className="block rounded-lg border p-4 hover:bg-neutral-50"
              >
                <div className="flex items-center gap-2">
                  {space.icon && <span>{space.icon}</span>}
                  <span className="font-medium">{space.name}</span>
                </div>
                {space.description && (
                  <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                    {space.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
